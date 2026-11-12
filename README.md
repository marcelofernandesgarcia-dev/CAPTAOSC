# CaptaOSC &bull; Mentor de Jornada para Captação de Recursos (MROSC & OGU)

> **Plataforma Estratégica e Técnica para Organizações da Sociedade Civil (OSCs)**  
> Conformidade com o **Marco Regulatório das OSCs (Lei Federal nº 13.019/2014)**, **Decreto Federal nº 11.948/2024**, **Lei Complementar nº 210/2024** e a Plataforma **Transferegov.br**.

---

## 🏛️ Sobre o Projeto

O **CaptaOSC** evoluiu de um repositório convencional de ferramentas para um **Mentor de Jornada de Captação**. Utilizando a **Arquitetura de Concierge (Triagem Inteligente)** e **Revelação Progressiva (Progressive Disclosure)**, a plataforma elimina a barreira do jargão técnico e blinda juridicamente os pleitos das entidades, prevenindo as reprovações históricas de propostas perante Ministérios e órgãos públicos.

A regra de ouro da interface é: **"O usuário nunca deve ver uma ferramenta antes de precisar dela."**

---

## 🎯 As 3 Rotas do Portal de Intenções (Sala de Espera Inteligente)

Ao abrir o CaptaOSC, o usuário não é sobrecarregado com dezenas de abas. Ele encontra 3 caminhos guiados:

1. 🛡️ **Minha Regularidade (Foco em Segurança):**  
   Verificação preventiva de aptidão do CNPJ na Receita Federal, eficácia temporal por esfera (1 ano para Municípios, 2 anos para Estados/DF e 3 anos para a União - Art. 33, V, "a") e checklist de certidões obrigatórias.
2. 📢 **Buscador de Recursos & Editais (Foco em Oportunidade):**  
   Integração em tempo real com o **Radar Nacional de Editais Abertos** (consumindo a API unificada do **Mapa das OSC / IPEA** e **Central de Editais Prosas** com mais de 110 chamamentos ativos e contagem regressiva de prazos), além do catálogo de Políticas Públicas e Emendas Parlamentares à LOA.
3. 📝 **Criador de Projetos & Ofícios (Foco em Execução):**  
   Estruturação do Plano de Trabalho, calculadora automática de menor preço com 3 orçamentos (segregação GND 3 vs GND 4), emissão do Ofício formal em Word (`.DOCX`), visualização de impressão e espelho Transferegov.br.

---

## ⚡ Inovações de Usabilidade & Engenharia

- **Arquitetura de Concierge:** Entrada por triagem de intenções, operando em *Modo Foco da Missão* com indicador de passos sequenciais (`Passo 1 > Passo 2 > Passo 3`).
- **Revelação por Conquista (Just-in-Time):** Módulos densos (como a *Trilha de 6 Passos do Transferegov.br* ou o *Ciclo do TCE*) são sugeridos apenas quando o usuário conclui o diagnóstico ou gera o ofício com sucesso.
- **Revelação Progressiva em 3 Níveis:**
  - 🟢 **Modo Simples (Iniciante):** Linguagem cidadã e dicas acolhedoras de preenchimento.
  - 🟡 **Modo Gestor (Padrão):** Foco em prazos, orçamentos, cotações e cronogramas de desembolso.
  - 🔴 **Modo Jurídico & Técnico:** Citações estritas dos artigos da Lei 13.019/14, Decreto 11.948/24 e conformidade com o Art. 45.
- **PWA & Mobile-First:** Navegação tátil com barra inferior (*Bottom Navigation*), gaveta retrátil (*Drawer*) e suporte offline local.

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Node.js, Express, `docx` (geração de documentos OpenXML oficiais) e cache em memória (TTL 1 hora) para as APIs públicas.
- **Frontend:** HTML5 Semântico, Tailwind CSS, Lucide Icons e JavaScript Puro (Vanilla) de alta performance e reatividade direta ao DOM.
- **APIs Conectadas:**
  - API do Prosas & Mapa das OSC (IPEA / Secretaria-Geral da Presidência)
  - API de Dados Cadastrais da Receita Federal (CNPJ / QSA)
  - Base de Ações Orçamentárias do Orçamento Geral da União (OGU / LOA)

---

## 🚀 Como Executar Localmente

```bash
# 1. Clonar o repositório
git clone https://github.com/marcelofernandesgarcia-dev/CAPTAOSC.git
cd CAPTAOSC

# 2. Instalar as dependências
npm install

# 3. Iniciar o servidor
npm start
```

Acesse a aplicação no navegador em: **`http://localhost:3000`**

---

## 📜 Licença

Desenvolvido para apoio e fortalecimento institucional das Organizações da Sociedade Civil (OSCs) brasileiras sob o regime do Marco Regulatório (MROSC).
