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

    // Cria a tabela de sessões caso não exista
    db.run(`CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      data TEXT
    )`);
  }
});

// --- ROTAS DA API ---

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

// 3. APAGAR: Remove uma sessão por completo
app.delete("/api/sessions/:id", (req, res) => {
  const id = req.params.id;

  db.run("DELETE FROM sessions WHERE id = ?", id, function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ success: true, deleted: this.changes });
  });
});

// Inicia o Servidor
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Servidor Backend Gestor Tático a rodar na porta ${PORT}`);
});
