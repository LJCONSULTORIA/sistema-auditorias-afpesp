# Arquitetura do Sistema de Auditorias AFPESP

## 1. Visão geral

O frontend React é publicado como aplicação estática. Autenticação, dados, arquivos e regras de autorização são fornecidos pelo Supabase. O navegador utiliza somente a chave publicável; operações administrativas com `service_role` ficam restritas às Edge Functions.

## 2. Dados operacionais

| Estrutura | Finalidade |
| --- | --- |
| `audit_profiles` | Perfil, nome, situação e troca obrigatória de senha. |
| `audit_allowed_users` | Relação de pessoas previamente autorizadas. |
| `audit_units` | Unidades de Lazer e setores da Sede. |
| `audit_documents` | Lista de documentos controlados. |
| `audit_checklists` | Modelos de checklist e seus itens em JSONB. |
| `audit_records` | Fonte oficial das auditorias e respostas em JSONB. |
| `audit_record_summaries` | Metadados sincronizados por gatilho para a listagem. |
| `audit_notifications` | Avisos internos de devolução/reabertura. |
| `audit_annual_plan_items` | Planejamento anual e situação de cada item. |
| `audit_password_reset_requests` | Solicitações internas de redefinição de senha. |
| bucket `audit-evidence` | Fotos e evidências, em armazenamento privado. |

As tabelas `audits`, `audit_answers` e `audit_photos` pertencem ao modelo normalizado inicial e estão vazias na verificação de 14/08/2026. Elas foram mantidas temporariamente para permitir uma retirada posterior, por migração própria e após novo backup.

## 3. Autorização

- políticas RLS exigem usuário ativo;
- o conteúdo completo de uma auditoria e suas imagens é acessível somente aos responsáveis e administradores;
- resumos operacionais são visíveis aos usuários ativos;
- somente o administrador exclui auditorias e confirma a finalização;
- o banco valida aprovação, devolução e reabertura por gatilho;
- a exclusão de checklist é bloqueada se houver vínculo no modelo atual ou legado.

Locais, documentos e checklists podem ser mantidos por usuários ativos. Essa é uma regra de negócio deliberada da AFPESP, e não ausência de controle técnico.

## 4. Evidências

O bucket `audit-evidence` é privado. O caminho segue `auditoria/resposta/arquivo`, e a aplicação cria URL assinada com duração de uma hora. São aceitos JPEG, PNG e WebP, com limite de 10 MB por objeto.

## 5. Relatórios e exportações

- Word no padrão MOD G 250 v009;
- checklist em Excel;
- backup lógico completo em JSON, produzido no servidor após validação administrativa;
- backup de evidências em ZIP com manifesto.

Os relatórios são baixados localmente e não ficam arquivados automaticamente no sistema.

## 6. Implantação

1. executar `npm ci`;
2. executar `npm run verify`;
3. aplicar as migrações pendentes no Supabase;
4. implantar as duas Edge Functions versionadas;
5. publicar o frontend;
6. validar login, permissões, ciclo de aprovação, relatório e backups.

## 7. Continuidade

A rotina disponível na aplicação é manual. Durante testes e operação oficial, a AFPESP deve gerar os dois arquivos diariamente, mantê-los em local externo protegido e realizar restaurações de prova. A automação do backup depende dos recursos e do plano contratados no provedor.

## 8. Limitações conhecidas

- o planejamento anual é administrado separadamente e ainda não é reconciliado automaticamente com as auditorias;
- não existe histórico imutável de todas as alterações de conteúdo;
- o envio de e-mail depende de SMTP institucional; as notificações atuais são internas;
- não há armazenamento automático dos relatórios Word emitidos;
- as tabelas legadas ainda existem no banco, embora estejam vazias e desconectadas do frontend.

## 9. Segurança operacional

- nunca expor `service_role` no frontend;
- manter RLS habilitada em todas as tabelas do schema exposto;
- revisar periodicamente os Advisors do Supabase;
- usar dependências fixas e `npm ci`;
- preservar e testar os backups antes de migrações;
- manter todas as Edge Functions e migrações no GitHub.
