/**
 * Script de Automação: Registro de Evolução do Projeto CaptaOSC no Obsidian
 * Uso: node scripts/registrar-evolucao.js "Título da Evolução" "Descrição das melhorias"
 */
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'config.json');
const DOCS_EVOLUCAO_DIR = path.join(__dirname, '..', 'docs', 'evolucao');

if (!fs.existsSync(DOCS_EVOLUCAO_DIR)) {
  fs.mkdirSync(DOCS_EVOLUCAO_DIR, { recursive: true });
}

function carregarConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
    } catch (e) {}
  }
  return {};
}

const args = process.argv.slice(2);
const titulo = args[0] || 'Atualização de Arquitetura e Negócio';
const descricao = args[1] || 'Separação do domínio de captação de recursos (OSC) do diário de bordo do desenvolvedor (Obsidian).';

const config = carregarConfig();
const hojeIso = new Date().toISOString().slice(0, 10);
const hojeFormatado = new Date().toLocaleDateString('pt-BR');
const slug = titulo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-');
const nomeArquivo = `Evolucao_${hojeIso}_${slug}.md`;

const markdown = `---
tipo: devlog_evolucao
projeto: CaptaOSC
versao: 3.0.0
data: "${hojeFormatado}"
tags:
  - captaosc
  - devlog
  - evolucao_software
  - mrosc
  - transferegov
---

# 📌 Diário de Bordo CaptaOSC: ${titulo}

> [!INFO] Ficha da Evolução
> - **Projeto:** CaptaOSC (MROSC & Transferegov)
> - **Data de Registro:** ${hojeFormatado} às ${new Date().toLocaleTimeString('pt-BR')}
> - **Ambiente:** Antigravity Local

## 🎯 Escopo da Evolução
${descricao}

## 🏗️ Decisões de Arquitetura
1. **Domínio da OSC:** Frontend e endpoints voltados estritamente à captação de emendas parlamentares, validação do Art. 33/39 do MROSC e cálculos orçamentários de GND 3 (Custeio) vs GND 4 (Capital).
2. **Domínio de Gestão / Obsidian:** O Obsidian atua como repositório de documentação viva, changelog e acompanhamento do desenvolvimento do software, isolado do operador da entidade social.

---
*Gerado via script de governança CaptaOSC.*
`;

// 1. Salvar no repositório de documentação do código
const pathLocal = path.join(DOCS_EVOLUCAO_DIR, nomeArquivo);
fs.writeFileSync(pathLocal, markdown, 'utf-8');
console.log(`\n✔ Log de evolução gravado em: ${pathLocal}`);

// 2. Salvar no Vault do Obsidian se configurado
if (config.obsidianVaultPath && fs.existsSync(config.obsidianVaultPath)) {
  const pathObsidian = path.join(config.obsidianVaultPath, nomeArquivo);
  fs.writeFileSync(pathObsidian, markdown, 'utf-8');
  console.log(`✔ Nota sincronizada com sucesso no seu Vault do Obsidian: ${pathObsidian}\n`);
} else {
  console.log(`ℹ Para sincronizar no Obsidian, configure "obsidianVaultPath" no arquivo config.json.\n`);
}
