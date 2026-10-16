# Checklist de instalação: Sendtec na Voltec

Servidor: `168.232.24.18` · Domínio: `sender.voltecautomacao.com.br` (Nginx Proxy Manager → porta `8080`)

Marque cada item conforme for concluindo.

---

## 1. Antes de começar, tenha em mãos

**IXC**
- [ ] URL do IXC (ex.: `https://ixc.voltec...`)
- [ ] Token da API no formato `id:token`, de um usuário com permissão de leitura em clientes, contratos e financeiro
  - No IXC: Configurações → Usuários → (usuário da integração) → aba de token/API

**Chatwoot**
- [ ] URL do Chatwoot
- [ ] Token de acesso de um administrador (no Chatwoot: Perfil → Token de acesso)
- [ ] ID da conta (é o número que aparece na URL: `/app/accounts/1/...`)
- [ ] ID da caixa de entrada do WhatsApp. Se não souber, o teste de conexão do Sendtec lista as caixas.

**Meta (Gerenciador de Negócios)**
- [ ] WABA ID: Gerenciador do WhatsApp → Configurações da conta → ID da conta do WhatsApp Business
- [ ] App ID: developers.facebook.com → Meus apps → ID do aplicativo usado pelo Chatwoot
- [ ] Token permanente de usuário do sistema:
  1. Configurações do negócio → Usuários → **Usuários do sistema** → Adicionar (função **Administrador**)
  2. **Atribuir ativos**: o app (controle total) e a conta do WhatsApp (controle total)
  3. **Gerar token**: escolha o app, validade **Nunca** e marque `whatsapp_business_management` e `whatsapp_business_messaging`
  4. Copie e guarde o token; ele só aparece uma vez

---

## 2. Servidor

- [ ] Docker e Docker Compose instalados (`docker compose version`)
- [ ] Baixar o código:
  ```bash
  git clone https://github.com/kingsizestrj/Sendtec.git sendtec
  cd sendtec
  ```
- [ ] Criar o `.env`:
  ```bash
  cp .env.example .env
  openssl rand -hex 32   # copie o resultado para APP_SECRET
  nano .env
  ```
  Preencha:
  ```
  APP_SECRET=<resultado do openssl>
  DB_PASSWORD=<uma senha forte>
  ADMIN_EMAIL=<seu e-mail>
  ADMIN_PASSWORD=<senha do primeiro acesso>
  PORT=8080
  ```
  > ⚠️ **Guarde o `APP_SECRET`.** Se ele mudar depois, os tokens salvos nas Configurações deixam de funcionar e precisam ser digitados de novo.
- [ ] Subir:
  ```bash
  docker compose up -d --build
  docker compose logs -f app   # aguarde "Sendtec rodando em http://localhost:3000"
  ```
- [ ] Testar direto pelo IP: `http://168.232.24.18:8080` deve abrir a tela de login

---

## 3. Nginx Proxy Manager

- [ ] O proxy host `sender.voltecautomacao.com.br` → `168.232.24.18`, porta `8080`, esquema `http`
- [ ] Aba **SSL**: certificado Let's Encrypt, com **Force SSL** ativado
- [ ] Aba **Advanced**, para permitir o envio de imagens:
  ```
  client_max_body_size 10M;
  ```
- [ ] Testar: `https://sender.voltecautomacao.com.br` abre com cadeado
- [ ] (Opcional) Bloquear a porta 8080 no firewall para acesso externo, deixando só 80 e 443

---

## 4. Primeiro acesso e configurações

- [ ] Entrar com `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- [ ] **Usuários**: trocar a senha do administrador e criar os operadores

Em **Configurações**, preencha e clique em **Testar conexão** em cada bloco:

- [ ] **IXC**: URL e token → o teste deve mostrar o total de clientes
  - Ajuste a ordem dos campos de telefone se vocês usam outro campo para WhatsApp
  - Escolha a origem das coordenadas: cadastro do cliente ou endereço de instalação
- [ ] **Chatwoot**: URL, token, conta e caixa → o teste deve dizer "Caixa de entrada do WhatsApp encontrada"
- [ ] **Meta**: WABA ID, App ID e token → o teste deve mostrar o nome da conta
- [ ] **Geral**:
  - [ ] Nome da empresa: `Voltec`
  - [ ] URL pública: `https://sender.voltecautomacao.com.br`
  - [ ] Centro do mapa: latitude e longitude da sua cidade
  - [ ] Mensagens por segundo: comece com `5`
- [ ] Clicar em **Salvar tudo**

---

## 5. Webhook no Chatwoot

É por ele que o Sendtec fica sabendo das entregas, leituras, falhas e de quem respondeu "SAIR".

- [ ] Em Configurações → Chatwoot, copie a **URL do webhook**. Ela começa com `https://sender.voltecautomacao.com.br/api/webhooks/chatwoot?token=...`
- [ ] No Chatwoot: Configurações → Integrações → **Webhooks** → Adicionar novo webhook
  - [ ] Cole a URL
  - [ ] Marque **Mensagem criada** e **Mensagem atualizada**
- [ ] Este webhook é separado do webhook da Meta que já existe no Facebook. **Não mexa no webhook da Meta**: ele continua apontando para o Chatwoot.

---

## 6. Modelos

- [ ] **Modelos → Sincronizar**: os modelos que já existem na conta aparecem com o status
- [ ] Criar um modelo de teste simples, por exemplo:
  - Nome: `teste_sendtec`
  - Categoria: Utilidade
  - Texto: `Olá {{1}}, este é um teste do novo sistema de avisos da Voltec.`
- [ ] Aguardar o status mudar para **Aprovado**. O sistema verifica sozinho; costuma levar alguns minutos.
- [ ] Criar um modelo **com imagem** e confirmar que a imagem aparece na análise. Isso confirma que a URL pública e o App ID estão certos.

---

## 7. Primeiro disparo (só para você)

- [ ] **Campanhas → Nova campanha**
- [ ] Modelo: `teste_sendtec`
- [ ] Público: filtro **Cliente → ID do cliente → é igual a → (o ID do seu próprio cadastro no IXC)**
- [ ] Variável `{{1}}` → Primeiro nome
- [ ] **Disparar agora**

Confira:
- [ ] A mensagem chegou no seu WhatsApp, com o nome certo
- [ ] No Chatwoot, apareceu uma conversa nova com a etiqueta `campanha-...`
- [ ] No relatório da campanha, o status passou de Enviada → Entregue → **Lida** depois que você abriu
- [ ] Responder **SAIR**: você deve receber a resposta automática e aparecer em **Descadastros**
- [ ] Remova-se de Descadastros depois do teste

**Se algo falhar**, o motivo aparece na coluna "Detalhe" do relatório. Os mais comuns:

| Sintoma | Causa provável |
|---|---|
| Mensagem chega sem as variáveis | Ative "Formato antigo de parâmetros" em Configurações → Chatwoot |
| Status fica parado em "Enviada" | Webhook do Chatwoot não cadastrado ou sem "Mensagem atualizada" |
| Erro ao enviar imagem de modelo | Falta o App ID, ou o `client_max_body_size` no Proxy Manager |
| Modelo com imagem falha no envio | URL pública não preenchida ou sem HTTPS |
| "Variável {{n}} ficou vazia" | O cliente não tem esse dado no IXC; use o campo "Se o campo estiver vazio, usar…" |

---

## 8. Teste com um grupo pequeno

- [ ] Desenhe no mapa uma área pequena (uma rua ou quadra) com 5 a 20 clientes, de preferência conhecidos
- [ ] Confira o contador "Vão receber" e a lista antes de disparar
- [ ] Dispare e acompanhe o relatório
- [ ] Se tudo estiver certo, a operação está liberada ✅

---

## Manutenção

- **Atualizar** para uma versão nova:
  ```bash
  cd sendtec && git pull && docker compose up -d --build
  ```
- **Backup do banco**:
  ```bash
  docker compose exec db pg_dump -U sendtec sendtec > backup-$(date +%F).sql
  ```
- **Ver os logs**: `docker compose logs -f app`
