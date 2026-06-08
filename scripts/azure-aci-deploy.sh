#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${AZURE_CONFIG_DIR:-}" ]]; then
  export AZURE_CONFIG_DIR="/private/tmp/azure-codex-config"
fi

: "${RESOURCE_GROUP:?RESOURCE_GROUP is required}"
: "${LOCATION:?LOCATION is required}"
: "${ACR_NAME:?ACR_NAME is required}"
: "${IMAGE_TAG:?IMAGE_TAG is required}"
: "${CONTAINER_GROUP_NAME:?CONTAINER_GROUP_NAME is required}"
: "${DNS_NAME_LABEL:?DNS_NAME_LABEL is required}"
: "${STORAGE_ACCOUNT_NAME:?STORAGE_ACCOUNT_NAME is required}"
: "${FILE_SHARE_NAME:?FILE_SHARE_NAME is required}"
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_ROOT_PASSWORD:?DB_ROOT_PASSWORD is required}"

IMAGE_NAME="${IMAGE_NAME:-album-copa-app}"
FULL_IMAGE_NAME="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"

echo "==> Creating resource group"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

echo "==> Ensuring Azure Container Registry"
if ! az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az acr create \
    --name "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Basic \
    --admin-enabled true >/dev/null
fi

echo "==> Building latest image in ACR"
az acr build \
  --registry "$ACR_NAME" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  . >/dev/null

echo "==> Ensuring storage account"
if ! az storage account show --name "$STORAGE_ACCOUNT_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az storage account create \
    --name "$STORAGE_ACCOUNT_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Standard_LRS >/dev/null
fi

STORAGE_KEY="$(az storage account keys list --resource-group "$RESOURCE_GROUP" --account-name "$STORAGE_ACCOUNT_NAME" --query '[0].value' -o tsv)"

echo "==> Ensuring file share"
az storage share-rm create \
  --resource-group "$RESOURCE_GROUP" \
  --storage-account "$STORAGE_ACCOUNT_NAME" \
  --name "$FILE_SHARE_NAME" \
  --quota 32 >/dev/null 2>&1 || true

ACR_USER="$(az acr credential show --name "$ACR_NAME" --query username -o tsv)"
ACR_PASS="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

TMP_YAML="$(mktemp /tmp/figurinhas-aci-XXXXXX.yaml)"
trap 'rm -f "$TMP_YAML"' EXIT

cat > "$TMP_YAML" <<EOF
apiVersion: 2021-10-01
location: ${LOCATION}
name: ${CONTAINER_GROUP_NAME}
type: Microsoft.ContainerInstance/containerGroups
properties:
  osType: Linux
  restartPolicy: Always
  imageRegistryCredentials:
    - server: ${ACR_NAME}.azurecr.io
      username: ${ACR_USER}
      password: ${ACR_PASS}
  containers:
    - name: app
      properties:
        image: ${FULL_IMAGE_NAME}
        ports:
          - port: 3000
            protocol: TCP
        environmentVariables:
          - name: HOST
            value: 0.0.0.0
          - name: PORT
            value: "3000"
          - name: DB_HOST
            value: 127.0.0.1
          - name: DB_PORT
            value: "3306"
          - name: DB_NAME
            value: ${DB_NAME}
          - name: DB_USER
            value: ${DB_USER}
          - name: DB_PASSWORD
            value: ${DB_PASSWORD}
          - name: DB_SSL
            value: "false"
        resources:
          requests:
            cpu: 1.0
            memoryInGB: 1.5
    - name: mariadb
      properties:
        image: mariadb:11
        environmentVariables:
          - name: MARIADB_DATABASE
            value: ${DB_NAME}
          - name: MARIADB_USER
            value: ${DB_USER}
          - name: MARIADB_PASSWORD
            value: ${DB_PASSWORD}
          - name: MARIADB_ROOT_PASSWORD
            value: ${DB_ROOT_PASSWORD}
        resources:
          requests:
            cpu: 1.0
            memoryInGB: 1.5
        volumeMounts:
          - name: mariadb-data
            mountPath: /var/lib/mysql
  ipAddress:
    type: Public
    dnsNameLabel: ${DNS_NAME_LABEL}
    ports:
      - protocol: TCP
        port: 3000
  volumes:
    - name: mariadb-data
      azureFile:
        shareName: ${FILE_SHARE_NAME}
        storageAccountName: ${STORAGE_ACCOUNT_NAME}
        storageAccountKey: ${STORAGE_KEY}
EOF

echo "==> Recreating container group"
if az container show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_GROUP_NAME" >/dev/null 2>&1; then
  az container delete --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_GROUP_NAME" --yes >/dev/null
fi

az container create --resource-group "$RESOURCE_GROUP" --file "$TMP_YAML" >/dev/null

FQDN="$(az container show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_GROUP_NAME" --query ipAddress.fqdn -o tsv)"
IP="$(az container show --resource-group "$RESOURCE_GROUP" --name "$CONTAINER_GROUP_NAME" --query ipAddress.ip -o tsv)"

echo
echo "Deploy finalizado."
echo "URL: http://${FQDN}:3000"
echo "IP: ${IP}"
echo "Image: ${FULL_IMAGE_NAME}"
