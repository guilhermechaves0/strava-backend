require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = 3000;

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true,
  })
);
app.use(cookieParser());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false },
  })
);

// --- ROTAS DE AUTENTICAÇÃO ---
app.get("/auth/strava", (req, res) => {
  const scope = "read,read_all,activity:read_all";
  // URL reescrita para evitar o bug de formatação
  const authUrl =
    "https://www.strava.com/oauth/authorize?client_id=" +
    process.env.STRAVA_CLIENT_ID +
    "&redirect_uri=" +
    process.env.REDIRECT_URI +
    "&response_type=code&scope=" +
    scope;

  console.log("Redirecionando usuário para a autorização do Strava...");
  res.redirect(authUrl);
});

app.get("/auth/strava/callback", async (req, res) => {
  const { code } = req.query;
  try {
    const tokenResponse = await axios.post(
      "https://www.strava.com/api/v3/oauth/token",
      {
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
      }
    );

    const { access_token, refresh_token, expires_at, athlete } =
      tokenResponse.data;
    req.session.strava_user = {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_at,
      athlete: athlete,
    };
    res.redirect("http://localhost:5173");
  } catch (error) {
    console.error(
      "Erro ao trocar código por token:",
      error.response ? error.response.data : error.message
    );
    res.status(500).send("Falha na autenticação com o Strava.");
  }
});

app.get("/api/user", (req, res) => {
  res.json({
    user: req.session.strava_user ? req.session.strava_user.athlete : null,
  });
});

app.post("/auth/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.status(500).send("Não foi possível fazer logout.");
    res.clearCookie("connect.sid");
    res.json({ message: "Logout bem-sucedido" });
  });
});

// --- ROTAS DE DADOS ---

app.get("/api/segments", async (req, res) => {
  try {
    const { bounds, activity_type } = req.query;
    if (!bounds || !activity_type)
      return res
        .status(400)
        .json({ message: "Parâmetros obrigatórios faltando." });

    const accessToken = req.session.strava_user
      ? req.session.strava_user.accessToken
      : process.env.STRAVA_ACCESS_TOKEN;

    // URL agora é limpa, sem o token
    const stravaApiUrl =
      "https://www.strava.com/api/v3/segments/explore?bounds=" +
      bounds +
      "&activity_type=" +
      activity_type;

    // Token enviado no cabeçalho
    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Falha ao buscar dados do Strava." });
  }
});

// Rota para os detalhes de um segmento - VERSÃO CORRIGIDA
app.get("/api/segments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const accessToken = req.session.strava_user
      ? req.session.strava_user.accessToken
      : process.env.STRAVA_ACCESS_TOKEN;

    // URL mais limpa
    const stravaApiUrl = "https://www.strava.com/api/v3/segments/" + id;

    // Token no cabeçalho
    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Falha ao buscar detalhes do segmento." });
  }
});

app.get("/api/segments/:id/leaderboard", async (req, res) => {
  if (!req.session.strava_user) {
    return res
      .status(401)
      .json({ message: "É preciso estar logado para ver o leaderboard." });
  }
  try {
    const { id } = req.params;
    const accessToken = req.session.strava_user.accessToken;
    // URL reescrita para evitar o bug de formatação
    const stravaApiUrl =
      "https://www.strava.com/api/v3/segments/" +
      id +
      "/leaderboard?page=1&per_page=10";

    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Falha ao buscar o leaderboard." });
  }
});

app.get("/api/athlete/activities", async (req, res) => {
  // Se não houver usuário logado, não há o que fazer.
  if (!req.session.strava_user) {
    return res
      .status(401)
      .json({ message: "É preciso estar logado para ver suas atividades." });
  }

  console.log("Recebido pedido para /api/athlete/activities");
  try {
    const accessToken = req.session.strava_user.accessToken;

    // Usamos o endpoint de atividades do atleta, pedindo as 30 mais recentes
    const stravaApiUrl =
      "https://www.strava.com/api/v3/athlete/activities?page=1&per_page=30";

    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });

    console.log("Atividades pessoais recebidas com sucesso!");
    res.json(response.data);
  } catch (error) {
    console.error(
      "Erro ao buscar atividades do atleta:",
      error.response ? error.response.data : error.message
    );
    res.status(500).json({ message: "Falha ao buscar as atividades." });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor backend rodando em http://localhost:${PORT}`);
});
