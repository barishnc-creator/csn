#!/usr/bin/env bash
# CSN — Oracle Cloud'da LiveKit sunucusunu otomatik oluşturur. OCI **Cloud Shell**'de çalıştırılır
# (Oracle konsolu sağ üst ">_" simgesi; kurulum gerekmez, oturum hazırdır).
#   curl -fsSL https://raw.githubusercontent.com/barishnc-creator/csn/main/selfhost/livekit/oracle-olustur.sh | bash
# - Yalnız kendi ağını (csn-vcn) oluşturur/günceller, başka kaynaklara dokunmaz.
# - "Out of host capacity" hatasında her bölgeyi (AD) dener, 60 sn bekleyip yeniden dener (Ctrl+C ile durur).
# - Makine açılınca kurulum.sh kendiliğinden çalışır (cloud-init).
# Seçenekler: SHAPE=VM.Standard.E2.1.Micro (A1 hiç bulunamazsa küçük AMD makine), OCPUS=2 MEM=12
set -uo pipefail
C=${OCI_TENANCY:?Bu betik OCI Cloud Shell içinde çalışmalı}
SHAPE=${SHAPE:-VM.Standard.A1.Flex}; OCPUS=${OCPUS:-4}; MEM=${MEM:-24}
NAME=csn-livekit
q() { oci "$@" 2>/dev/null; }

echo "== Ağ (csn-vcn)"
VCN=$(q network vcn list -c "$C" --display-name csn-vcn --query 'data[0].id' --raw-output)
if [ -z "$VCN" ] || [ "$VCN" = null ]; then
  VCN=$(oci network vcn create -c "$C" --cidr-block 10.0.0.0/16 --display-name csn-vcn --dns-label csnvcn \
        --wait-for-state AVAILABLE --query 'data.id' --raw-output) || exit 1
fi
RT=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-route-table-id"' --raw-output)
SL=$(oci network vcn get --vcn-id "$VCN" --query 'data."default-security-list-id"' --raw-output)
IGW=$(q network internet-gateway list -c "$C" --vcn-id "$VCN" --query 'data[0].id' --raw-output)
if [ -z "$IGW" ] || [ "$IGW" = null ]; then
  IGW=$(oci network internet-gateway create -c "$C" --vcn-id "$VCN" --is-enabled true --display-name csn-igw \
        --wait-for-state AVAILABLE --query 'data.id' --raw-output) || exit 1
fi
oci network route-table update --rt-id "$RT" --force \
  --route-rules "[{\"destination\":\"0.0.0.0/0\",\"destinationType\":\"CIDR_BLOCK\",\"networkEntityId\":\"$IGW\"}]" >/dev/null || exit 1
tcp() { echo "{\"protocol\":\"6\",\"source\":\"0.0.0.0/0\",\"tcpOptions\":{\"destinationPortRange\":{\"min\":$1,\"max\":${2:-$1}}}}"; }
udp() { echo "{\"protocol\":\"17\",\"source\":\"0.0.0.0/0\",\"udpOptions\":{\"destinationPortRange\":{\"min\":$1,\"max\":${2:-$1}}}}"; }
cat > /tmp/csn-rules.json <<JSON
[$(tcp 22),$(tcp 80),$(tcp 443),$(tcp 7881),$(udp 3478),$(udp 50000 60000),$(udp 30000 40000),
 {"protocol":"1","source":"0.0.0.0/0","icmpOptions":{"type":3,"code":4}}]
JSON
oci network security-list update --security-list-id "$SL" --ingress-security-rules file:///tmp/csn-rules.json --force >/dev/null || exit 1
SUB=$(q network subnet list -c "$C" --vcn-id "$VCN" --query 'data[0].id' --raw-output)
if [ -z "$SUB" ] || [ "$SUB" = null ]; then
  SUB=$(oci network subnet create -c "$C" --vcn-id "$VCN" --cidr-block 10.0.0.0/24 --display-name csn-subnet \
        --route-table-id "$RT" --security-list-ids "[\"$SL\"]" --dns-label csnsub \
        --wait-for-state AVAILABLE --query 'data.id' --raw-output) || exit 1
fi

echo "== Ubuntu imajı ($SHAPE)"
IMG=$(oci compute image list -c "$C" --operating-system "Canonical Ubuntu" --operating-system-version "24.04" \
      --shape "$SHAPE" --sort-by TIMECREATED --sort-order DESC --query 'data[0].id' --raw-output)
[ -n "$IMG" ] && [ "$IMG" != null ] || { echo "Ubuntu 24.04 imajı bulunamadı"; exit 1; }

[ -f ~/.ssh/id_rsa.pub ] || ssh-keygen -t rsa -b 4096 -N "" -f ~/.ssh/id_rsa -q
cat > /tmp/csn-init.sh <<'INIT'
#!/bin/bash
curl -fsSL https://raw.githubusercontent.com/barishnc-creator/csn/main/selfhost/livekit/kurulum.sh | bash > /var/log/csn-kurulum.log 2>&1
INIT

EXIST=$(q compute instance list -c "$C" --display-name "$NAME" --lifecycle-state RUNNING --query 'data[0].id' --raw-output)
if [ -n "$EXIST" ] && [ "$EXIST" != null ]; then ID=$EXIST; echo "== Zaten var: $ID"; else
  SC=(); [[ "$SHAPE" == *Flex ]] && SC=(--shape-config "{\"ocpus\":$OCPUS,\"memoryInGBs\":$MEM}")
  ADS=$(oci iam availability-domain list -c "$C" --query 'data[].name' --raw-output | tr -d '[]", ' | grep .)
  echo "== Makine oluşturuluyor (yer yoksa 60 sn'de bir yeniden dener; Ctrl+C ile durdur)"
  ID=""; n=0
  while [ -z "$ID" ]; do
    n=$((n+1))
    for AD in $ADS; do
      OUT=$(oci compute instance launch -c "$C" --availability-domain "$AD" --shape "$SHAPE" "${SC[@]}" \
            --image-id "$IMG" --subnet-id "$SUB" --assign-public-ip true --display-name "$NAME" \
            --boot-volume-size-in-gbs 50 --ssh-authorized-keys-file ~/.ssh/id_rsa.pub \
            --user-data-file /tmp/csn-init.sh --query 'data.id' --raw-output 2>&1)
      if [[ "$OUT" == ocid1.instance* ]]; then ID=$OUT; break; fi
      if echo "$OUT" | grep -qi "capacity"; then echo "  deneme $n · $AD: yer yok";
      else echo "  deneme $n · $AD: $(echo "$OUT" | grep -m1 -i message)"; fi
    done
    [ -n "$ID" ] || sleep 60
  done
  echo "== Oluşturuldu, açılması bekleniyor"
  oci compute instance get --instance-id "$ID" >/dev/null
  for i in $(seq 1 60); do
    ST=$(oci compute instance get --instance-id "$ID" --query 'data."lifecycle-state"' --raw-output); [ "$ST" = RUNNING ] && break; sleep 10
  done
fi
IP=$(oci compute instance list-vnics --instance-id "$ID" --query 'data[0]."public-ip"' --raw-output)
echo
echo "✅ Sunucu: $IP"
echo "Kurulum makine içinde kendiliğinden sürüyor (3-5 dk). Sonra anahtarları görmek için:"
echo "  ssh -o StrictHostKeyChecking=accept-new ubuntu@$IP sudo cat /opt/csn-livekit/BILGI.txt"
echo "İlerlemeyi izlemek için:  ssh ubuntu@$IP sudo tail -f /var/log/csn-kurulum.log"
