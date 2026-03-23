const express = require("express");
const cors = require("cors");
const sqlite3 = require("sqlite3").verbose();

const app = express();

// Permite comunicação com o seu frontend (React)
app.use(cors());

// Aumenta o limite do JSON pois sessões com muitas listas podem ficar grandes
app.use(express.json({ limit: "10mb" }));

// Conecta ou cria o ficheiro de banco de dados SQLite local
const db = new sqlite3.Database("./gestor.db", (err) => {
  if (err) {
    console.error("❌ Erro ao abrir o banco de dados:", err.message);
  } else {
    console.log("✅ Conectado ao banco de dados SQLite.");

    // Cria a tabela de sessões ativas
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT
    )`);

    // Cria a tabela de histórico (arquivo morto)
    db.run(`CREATE TABLE IF NOT EXISTS sessions_history (
      id TEXT PRIMARY KEY,
      data TEXT,
      archived_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
  }
});

// --- ROTAS DA API ---

// 0. TEMPO DO SERVIDOR: Para Sicronização de Relógios "Anti-Deslize"
app.get("/api/time", (req, res) => {
  res.json({ serverTime: Date.now() });
});

// 1. LER: Retorna todas as sessões guardadas
app.get("/api/sessions", (req, res) => {
  db.all("SELECT data FROM sessions", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    // Converte os textos guardados de volta para objetos JSON
    const sessions = rows.map((row) => JSON.parse(row.data));
    res.json(sessions);
  });
});

// 2. GRAVAR: Cria ou Atualiza uma sessão
app.post("/api/sessions", (req, res) => {
  const session = req.body;
  const id = session.id;
  const data = JSON.stringify(session); // Transforma em texto para o SQLite

  const query = `
    INSERT INTO sessions (id, data) VALUES (?, ?)
    ON CONFLICT(id) DO UPDATE SET data=excluded.data
  `;

  db.run(query, [id, data], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, id: id });
  });
});

// 3. APAGAR (ARQUIVAR): Move uma sessão para o arquivo em vez de destruir
app.delete("/api/sessions/:id", (req, res) => {
  const id = req.params.id;

  // Primeiro busca a sessão na tabela principal
  db.get("SELECT data FROM sessions WHERE id = ?", [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: "Sessão não encontrada" });

    // Insere no arquivo de histórico
    db.run("INSERT OR REPLACE INTO sessions_history (id, data) VALUES (?, ?)", [id, row.data], (err2) => {
      if (err2) return res.status(500).json({ error: err2.message });

      // Só apaga da principal depois de garantir que foi para o histórico
      db.run("DELETE FROM sessions WHERE id = ?", id, function (err3) {
        if (err3) return res.status(500).json({ error: err3.message });
        res.json({ success: true, archived: true, deleted: this.changes });
      });
    });
  });
});

// 4. LER HISTÓRICO: Retorna as sessões arquivadas
app.get("/api/sessions/history", (req, res) => {
  db.all("SELECT data, archived_at FROM sessions_history ORDER BY archived_at DESC", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    const history = rows.map((row) => {
      const parsed = JSON.parse(row.data);
      parsed.archivedAt = row.archived_at;
      return parsed;
    });
    res.json(history);
  });
});

// Inicia o Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend Gestor Tático a rodar na porta ${PORT}`);
});
