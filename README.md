# Sistema de Auditorias Internas — AFPESP

Aplicação web responsiva para planejamento, programação, execução, aprovação e emissão de relatórios de auditorias internas da AFPESP.

## Arquitetura atual

- React 19, TypeScript e Vite;
- Tailwind CSS, React Router e Chart.js;
- Supabase Auth para autenticação e sessão;
- PostgreSQL com Row Level Security (RLS), funções e gatilhos de integridade;
- Supabase Storage privado para fotos e evidências;
- Supabase Edge Functions para administração de usuários e solicitação interna de senha;
- geração de relatório Word MOD G 250 v009, checklist Excel e backups JSON/ZIP;
- publicação estática pelo GitHub Pages.

O IndexedDB/Dexie utilizado no protótipo inicial foi removido. A fonte oficial dos dados é o Supabase.

## Perfis

- **Auditor:** acessa e altera as auditorias em que está designado, enquanto o status permitir edição.
- **Administrador:** acessa todas as auditorias, administra usuários, aprova, devolve, reabre, exclui e gera backups.

Os cadastros corporativos de locais, documentos e checklists permanecem disponíveis aos usuários ativos conforme a regra operacional definida pela AFPESP. Auditorias completas e evidências são restritas aos responsáveis e administradores.

## Ciclo da auditoria

1. `Programada`;
2. `Em andamento`;
3. `Finalizada e aguardando aprovação`;
4. `Devolvido para ajustes`, quando o ADM solicita correção; ou
5. `Finalizada`, após aprovação administrativa.

As transições críticas são validadas no banco, e não apenas na interface.

## Configuração

Crie um arquivo `.env.local` a partir de `.env.example` e informe `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`.

Nunca coloque `service_role` ou secret key no cliente. Essas credenciais pertencem somente ao ambiente protegido das Edge Functions.

## Execução e validação

```bash
npm ci
npm run dev
npm run verify
```

`npm run verify` confirma as regras arquiteturais, executa o TypeScript e produz o build de produção.

## Banco e funções

As alterações do banco são versionadas em `supabase/migrations`. As funções estão em:

- `supabase/functions/manage-audit-users`;
- `supabase/functions/request-password-reset`.

Consulte [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) para o modelo de dados, permissões, implantação, backup e limitações.

## Publicação

```bash
npm run deploy
```

O comando valida e compila antes de publicar `dist` no GitHub Pages.

## Backups

Na área **Usuários**, o ADM deve gerar os dados completos em JSON e as imagens/evidências em ZIP com manifesto. Os arquivos devem ser armazenados fora do Supabase. A rotina atual é manual; recomenda-se execução diária e teste periódico de restauração.
