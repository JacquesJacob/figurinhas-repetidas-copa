#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${AZURE_CONFIG_DIR:-}" ]]; then
  export AZURE_CONFIG_DIR="/private/tmp/azure-codex-config"
fi

if [[ -z "${RESOURCE_GROUP:-}" ]]; then
  echo "RESOURCE_GROUP is required"
  exit 1
fi

if [[ -z "${LOCATION:-}" ]]; then
  echo "LOCATION is required"
  exit 1
fi

if [[ -z "${ACR_NAME:-}" ]]; then
  echo "ACR_NAME is required"
  exit 1
fi

if [[ -z "${CONTAINERAPPS_ENV:-}" ]]; then
  echo "CONTAINERAPPS_ENV is required"
  exit 1
fi

if [[ -z "${APP_NAME:-}" ]]; then
  echo "APP_NAME is required"
  exit 1
fi

if [[ -z "${MYSQL_SERVER_NAME:-}" ]]; then
  echo "MYSQL_SERVER_NAME is required"
  exit 1
fi

if [[ -z "${MYSQL_ADMIN_USER:-}" ]]; then
  echo "MYSQL_ADMIN_USER is required"
  exit 1
fi

if [[ -z "${MYSQL_ADMIN_PASSWORD:-}" ]]; then
  echo "MYSQL_ADMIN_PASSWORD is required"
  exit 1
fi

if [[ -z "${MYSQL_DATABASE_NAME:-}" ]]; then
  echo "MYSQL_DATABASE_NAME is required"
  exit 1
fi

IMAGE_NAME="${IMAGE_NAME:-album-copa-app}"
IMAGE_TAG="${IMAGE_TAG:-$(git rev-parse --short HEAD 2>/dev/null || date +%s)}"
FULL_IMAGE_NAME="${ACR_NAME}.azurecr.io/${IMAGE_NAME}:${IMAGE_TAG}"

echo "==> Ensuring Azure CLI extensions"
az extension add --name containerapp --upgrade --allow-preview true >/dev/null

echo "==> Creating resource group"
az group create --name "$RESOURCE_GROUP" --location "$LOCATION" >/dev/null

echo "==> Creating Azure Container Registry if needed"
if ! az acr show --name "$ACR_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az acr create \
    --name "$ACR_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" \
    --sku Basic \
    --admin-enabled true >/dev/null
fi

echo "==> Building image in ACR"
az acr build \
  --registry "$ACR_NAME" \
  --image "${IMAGE_NAME}:${IMAGE_TAG}" \
  . >/dev/null

echo "==> Creating Container Apps environment if needed"
if ! az containerapp env show --name "$CONTAINERAPPS_ENV" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az containerapp env create \
    --name "$CONTAINERAPPS_ENV" \
    --resource-group "$RESOURCE_GROUP" \
    --location "$LOCATION" >/dev/null
fi

echo "==> Creating MySQL Flexible Server if needed"
if ! az mysql flexible-server show --name "$MYSQL_SERVER_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az mysql flexible-server create \
    --resource-group "$RESOURCE_GROUP" \
    --name "$MYSQL_SERVER_NAME" \
    --location "$LOCATION" \
    --admin-user "$MYSQL_ADMIN_USER" \
    --admin-password "$MYSQL_ADMIN_PASSWORD" \
    --database-name "$MYSQL_DATABASE_NAME" \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --storage-size 20 \
    --version 8.0.21 \
    --public-access All >/dev/null
fi

MYSQL_FQDN="$(az mysql flexible-server show --name "$MYSQL_SERVER_NAME" --resource-group "$RESOURCE_GROUP" --query fullyQualifiedDomainName -o tsv)"

ACR_USER="$(az acr credential show --name "$ACR_NAME" --query username -o tsv)"
ACR_PASS="$(az acr credential show --name "$ACR_NAME" --query 'passwords[0].value' -o tsv)"

echo "==> Creating or updating Container App"
if az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" >/dev/null 2>&1; then
  az containerapp update \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --image "$FULL_IMAGE_NAME" \
    --set-env-vars \
      HOST=0.0.0.0 \
      PORT=3000 \
      DB_HOST="$MYSQL_FQDN" \
      DB_PORT=3306 \
      DB_NAME="$MYSQL_DATABASE_NAME" \
      DB_USER="${MYSQL_ADMIN_USER}" \
      DB_PASSWORD="$MYSQL_ADMIN_PASSWORD" \
      DB_SSL=true >/dev/null
else
  az containerapp create \
    --name "$APP_NAME" \
    --resource-group "$RESOURCE_GROUP" \
    --environment "$CONTAINERAPPS_ENV" \
    --image "$FULL_IMAGE_NAME" \
    --target-port 3000 \
    --ingress external \
    --registry-server "${ACR_NAME}.azurecr.io" \
    --registry-username "$ACR_USER" \
    --registry-password "$ACR_PASS" \
    --min-replicas 1 \
    --max-replicas 2 \
    --env-vars \
      HOST=0.0.0.0 \
      PORT=3000 \
      DB_HOST="$MYSQL_FQDN" \
      DB_PORT=3306 \
      DB_NAME="$MYSQL_DATABASE_NAME" \
      DB_USER="${MYSQL_ADMIN_USER}" \
      DB_PASSWORD="$MYSQL_ADMIN_PASSWORD" \
      DB_SSL=true >/dev/null
fi

FQDN="$(az containerapp show --name "$APP_NAME" --resource-group "$RESOURCE_GROUP" --query properties.configuration.ingress.fqdn -o tsv)"

echo
echo "Deploy finalizado."
echo "App URL: https://${FQDN}"
echo "Image: ${FULL_IMAGE_NAME}"
