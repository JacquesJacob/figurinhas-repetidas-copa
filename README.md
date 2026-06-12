# Troca de Figurinhas do Condominio

Sistema web simples para organizar trocas de figurinhas do album Panini da Copa do Mundo 2026 dentro de um condominio.

<img width="979" height="634" alt="image" src="https://github.com/user-attachments/assets/17c527d0-ad8b-4bf9-97a0-59fc2b5b9233" />


## O que esta pronto

- Cadastro com nome, email, senha, bloco, apartamento e celular opcional
- Login e logout com sessao por cookie
- Checklist interativo para marcar figurinhas faltantes e repetidas
- Cruzamento automatico entre usuarios para mostrar quem tem as figurinhas que voce precisa
- Persistencia em MariaDB
- Catalogo inicial com 980 figurinhas
- Ambiente local completo com `docker compose`
- Painel administrativo em `/admin`

## Importante sobre a numeracao

Em 7 de junho de 2026, eu nao encontrei uma pagina oficial simples da Panini ou da FIFA com a checklist completa aberta em formato facil de consumir. O catalogo desta primeira versao foi montado a partir de:

- FIFA: anuncio oficial da colecao digital 2026
- Scanini: checklist publica com 980 figurinhas

Antes de colocar em producao no condominio, vale conferir a numeracao do album fisico de voces e ajustar qualquer divergencia.

## Como rodar localmente com containers

```bash
docker compose up --build
```

Depois abra:

```text
http://localhost:3000
```

Banco local:

```text
localhost:3307
```

Credenciais padrao do ambiente local:

- Banco: `album_copa`
- Usuario: `album_user`
- Senha: `album_pass`

## Publicar no GitHub

Quando o `gh` estiver autenticado novamente, a sequencia recomendada e:

```bash
git add .
git commit -m "Initial release of album-copa"
gh repo create album-copa --private --source . --remote origin --push
```

Se preferir repo publico, troque `--private` por `--public`.

## Deploy no Azure

Recomendacao para producao:

- Azure Container Apps para a aplicacao Node
- Azure Container Registry para armazenar a imagem
- Azure Database for MySQL Flexible Server para o banco

O script [scripts/azure-container-apps-deploy.sh](/Users/jacquesjacob/Documents/album-copa/scripts/azure-container-apps-deploy.sh) prepara essa infraestrutura e publica a imagem no Azure.

Exemplo de uso:

```bash
export AZURE_CONFIG_DIR=/private/tmp/azure-codex-config
az login

export RESOURCE_GROUP=rg-album-copa-prod
export LOCATION=eastus
export ACR_NAME=albumcoparegistry
export CONTAINERAPPS_ENV=env-album-copa-prod
export APP_NAME=album-copa-app
export MYSQL_SERVER_NAME=album-copa-mysql-prod
export MYSQL_ADMIN_USER=albumadmin
export MYSQL_ADMIN_PASSWORD='TroqueEstaSenha123!'
export MYSQL_DATABASE_NAME=album_copa

bash scripts/azure-container-apps-deploy.sh
```

Observacoes:

- O `gh` atual desta maquina esta com token invalido e precisa de novo login.
- O Azure CLI funciona melhor aqui usando `AZURE_CONFIG_DIR=/private/tmp/azure-codex-config`.
- Para Azure MySQL, a aplicacao ja suporta conexao SSL por variaveis de ambiente.
- No Azure Database for MySQL Flexible Server, use o login administrativo simples em `DB_USER` (ex.: `albumadmin`), sem concatenar `@nome-do-servidor`.

## Painel administrativo

URL:

```text
http://localhost:3000/admin
```

Credenciais iniciais:

- Usuario: `admin`
- Senha inicial: `Admin@123`

No primeiro acesso, o sistema exige a troca dessa senha antes de liberar o painel.

## Estrutura

- `server.js`: servidor HTTP, autenticacao e APIs
- `lib/database.js`: camada SQL e inicializacao do schema
- `lib/core.js`: regras de negocio reutilizaveis
- `album-data.js`: dataset do album 2026
- `public/`: interface web
- `docker-compose.yml`: app + MariaDB
- `Dockerfile`: imagem local da aplicacao

## Proximos passos recomendados

1. Adicionar reset de senha e validacao de email.
2. Criar filtros de match por bloco e aviso por WhatsApp.
3. Confirmar a checklist final com base no album fisico do condominio.
4. Publicar no GitHub e preparar deploy no Azure App Service ou Container Apps.
