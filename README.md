# CFO Sistema — Peças Automotivas

Sistema de gestão financeira multi-canal com DRE, lançamentos e análise por canal.

## Como subir no Replit (10 minutos)

### 1. Criar conta no Replit
Acesse https://replit.com e crie uma conta gratuita.

### 2. Criar novo Repl
- Clique em **"+ Create Repl"**
- Selecione **"Import from ZIP"** ou **"Node.js"**
- Se Node.js: copie os arquivos manualmente

### 3. Subir os arquivos
Faça upload do ZIP com todos os arquivos do projeto.
Estrutura esperada:
```
cfo-sistema/
├── server.js
├── package.json
├── .replit
├── replit.nix
└── public/
    └── index.html
```

### 4. Configurar variável de ambiente
No Replit, vá em **Secrets** (cadeado na sidebar) e adicione:
- `JWT_SECRET` = `qualquer-string-secreta-longa-aqui-2026`

### 5. Rodar
Clique em **Run** — o sistema sobe automaticamente!
O link ficará disponível no formato: `https://seu-repl.seu-usuario.repl.co`

## Usuários padrão (trocar senha depois!)
- daniel@empresa.com / cfo2026
- rafaela@empresa.com / cfo2026  
- amauri@empresa.com / cfo2026

## Canais suportados
- **Mercado Livre**: aba table-pedidos1, colunas padrão MT
- **Shopee**: aba table-pedidos1, imposto corrigido automaticamente para 3%

## Tecnologias
- Node.js + Express (backend)
- SQLite / better-sqlite3 (banco de dados)
- JWT (autenticação)
- Vanilla JS + Chart.js (frontend)
