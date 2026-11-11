# CaptaOSC &bull; Inteligência & Gestão de Emendas Parlamentares Federais

> **Plataforma Estratégica e Técnica para Organizações da Sociedade Civil (OSCs)**  
> Conformidade com o **Marco Regulatório das OSCs (Lei Federal nº 13.019/2014)**, **Lei Complementar nº 210/2024** e a Plataforma **Transferegov.br**.

---

## 🏛️ Sobre o Projeto

O **CaptaOSC** é uma aplicação completa e autônoma desenvolvida para capacitar, assessorar e orientar dirigentes e equipes técnicas de entidades sem fins lucrativos na captação, estruturação e execução de **Emendas Parlamentares Federais** e recursos do **Orçamento Geral da União (OGU)**.

A aplicação elimina o empirismo e as perdas de recursos causadas por diligências e impedimentos técnicos, blindando juridicamente os pleitos das entidades.

---

## ⚡ Principais Módulos & Funcionalidades

### 💡 Guia & Usabilidade Orçamentária
- Diferenciação didática entre **Orçamento Impositivo (RP 6 / RP 7)** e **Orçamento Discricionário (RP 2 / RP 8)**.
- Explicação jurídica do **Art. 29 da Lei 13.019/2014** (dispensa de chamamento público para emendas) frente ao Art. 16 (chamamento público concorrencial para editais).
- Orientações sobre a cota constitucional obrigatória de **50% para Ações e Serviços Públicos de Saúde (ASPS)**.

### 🔎 1. Consulta de Emendas & Inteligência do Congresso
- **Políticas Públicas dos Ministérios (OGU / LOA):** Catálogo de Ações Orçamentárias (`21C0`, `8535`, `20V0`, `20RG`, `20ZX`, `21B9`, `21A7`), dotação LOA e diretrizes de custeio (GND 3) vs. capital (GND 4).
- **Emendas Parlamentares da Bancada:** Integração em tempo real com as APIs oficiais de Dados Abertos da **Câmara dos Deputados** e do **Senado Federal**, mapeando parlamentares por UF com normalização Unicode.
- **Vínculo em 1 Clique (`✨ Vincular ao meu Pleito`):** Carrega automaticamente a ação, órgão e minuta no formulário do pleito.

### 📝 2. Elaborador do Pleito & Assistente Anti-Impedimento
- Validação automática de CNPJ perante o **Art. 33, III (3 anos de existência para a União)** e **Art. 39 (situação cadastral ATIVA)** via ReceitaWS/BrasilAPI.
- **Assistente Anti-Impedimento Técnico (GND 3 vs. GND 4):** Validador inteligente que previne erros de enquadramento (ex.: excesso de capital em ações estritamente de custeio ambulatorial).

### ✉️ 3. Gerador Oficial de Ofício (Word .DOCX & PDF)
- **Exportação em `.DOCX` (Microsoft Word):** Gera documentos formatados no padrão do *Manual de Redação da Presidência da República* e ABNT, com margens oficiais, identificação de bancada e tabela orçamentária.
- **Visualização & Impressão em PDF Oficial:** Layout timbrado para assinatura física ou digital via **Gov.br / ICP-Brasil**.
- **Minuta do Plano de Trabalho Transferegov.br:** Espelho descritivo em texto puro formatado para preenchimento ágil na plataforma federal.

### 📅 4. Ciclo Anual & Calendário Orçamentário
- Cronograma estratégico em 4 etapas (Fev-Jul: Diagnóstico; Ago-Out: Protocolo; Nov-Dez: Votação LOA; Jan-Jun: Transferegov).

### 🚀 5. Trilha Transferegov.br & Checklist MROSC
- **Checklist Interativo de Pré-Habilitação MROSC:** 8 critérios fundamentais (CND Federal, FGTS, CNDT, CADIN, Estatuto, Transferegov, etc.) com links diretos aos portais oficiais e **Termômetro de Prontidão da OSC**.
- Passo a passo das 6 fases operacionais (do credenciamento ao OBTV e prestação de contas digital).

### ⚖️ 6. Matriz Normativa
- Consolidação dos dispositivos da CF/88 (arts. 165 e 166), Lei Complementar nº 210/2024, Lei 13.019/2014, Decreto Federal 8.726/2016 e Portaria Conjunta MGI/MF/CGU nº 32/2024.

---

## 🛠️ Tecnologias Utilizadas

- **Backend:** Node.js, Express, `docx` (Word processing nativo)
- **Frontend:** Single-Page Application (SPA) responsiva com Tailwind CSS e Lucide Icons
- **Integrações de Dados Abertos:**
  - API da Câmara dos Deputados (`dadosabertos.camara.leg.br`)
  - API do Senado Federal (`legis.senado.leg.br`)
  - API ReceitaWS / BrasilAPI (Validação cadastral de CNPJ)

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

Desenvolvido para apoio e fortalecimento institucional das Organizações da Sociedade Civil (OSCs) brasileiras.
