# Hora Bela — agenda online para profissionais de beleza (SaaS)

Não é marketplace: cada profissional tem apenas a sua página (`/seu-nome`) e a sua agenda.

## Rodar
Requer Node 22.5+ (sem dependências npm; usa o SQLite embutido do Node).

    ADMIN_EMAIL=voce@dominio.com ADMIN_PASSWORD='uma-senha-forte' npm start

Abra http://localhost:3000. O painel do proprietário fica em `/admin` (login em `/entrar`).
Se ADMIN_PASSWORD não for definida, uma senha é gerada e exibida no console no primeiro boot.

## Variáveis
- PORT (3000) · DATA_DIR (./data: banco SQLite e fotos) · TZ (America/Sao_Paulo)
- COOKIE_SECURE=1 (em produção com HTTPS) · TRUST_PROXY=1 (atrás de proxy/Nginx)
- Domínio próprio: aponte o DNS para o servidor e informe o endereço em Admin > Sistema.

## Testes
    npm test   # regras de agenda + fluxo completo no navegador (precisa do Playwright)

## Backup
Copie a pasta DATA_DIR (horabela.db + uploads/).

## Pagamentos recorrentes
Tabelas `plans` e `subscriptions` já têm provider/provider_ref para ligar Stripe/Asaas/Mercado Pago depois.

## Início rápido no computador
Windows: dê dois cliques em `iniciar.bat`. Mac/Linux: `iniciar.command`. Depois abra http://localhost:3000
(Admin: admin@horabela.local / TroqueEstaSenha123 — troque no arquivo antes de usar de verdade.)

## Hospedagem com Docker / Render
Há um `Dockerfile` e um `render.yaml`. Na Render: New > Blueprint > aponte para o repositório com este projeto,
informe ADMIN_EMAIL e ADMIN_PASSWORD. O disco de 1 GB em /data guarda banco e fotos. Domínio próprio em Settings > Custom Domains.
