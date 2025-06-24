require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const session = require("express-session");
const cookieParser = require("cookie-parser");

const app = express();
const PORT = 3000;

const allowedOrigins = [
  "http://localhost:5173",
  process.env.FRONTEND_URL,
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Origem não permitida pela política de CORS"));
      }
    },
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

app.get("/auth/strava", (req, res) => {
  const scope = "read,read_all,activity:read_all";
  const authUrl =
    "https://www.strava.com/oauth/authorize?client_id=" +
    process.env.STRAVA_CLIENT_ID +
    "&redirect_uri=" +
    process.env.REDIRECT_URI +
    "&response_type=code&scope=" +
    scope;
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

    // Manda o usuário de volta para o endereço do frontend que está no ar
    res.redirect(process.env.FRONTEND_URL || "http://localhost:5173");
  } catch (error) {
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
    const stravaApiUrl =
      "https://www.strava.com/api/v3/segments/explore?bounds=" +
      bounds +
      "&activity_type=" +
      activity_type;
    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Falha ao buscar dados do Strava." });
  }
});
app.get("/api/segments/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const accessToken = req.session.strava_user
      ? req.session.strava_user.accessToken
      : process.env.STRAVA_ACCESS_TOKEN;
    const stravaApiUrl = "https://www.strava.com/api/v3/segments/" + id;
    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Falha ao buscar detalhes do segmento." });
  }
});
app.get("/api/segments/:id/leaderboard", async (req, res) => {
  if (!req.session.strava_user)
    return res
      .status(401)
      .json({ message: "É preciso estar logado para ver o leaderboard." });
  try {
    const { id } = req.params;
    const accessToken = req.session.strava_user.accessToken;
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
  if (!req.session.strava_user)
    return res
      .status(401)
      .json({ message: "É preciso estar logado para ver suas atividades." });
  try {
    const accessToken = req.session.strava_user.accessToken;
    const stravaApiUrl =
      "https://www.strava.com/api/v3/athlete/activities?page=1&per_page=30";
    const response = await axios.get(stravaApiUrl, {
      headers: { Authorization: "Bearer " + accessToken },
    });
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ message: "Falha ao buscar as atividades." });
  }
});

app.listen(process.env.PORT || PORT, "0.0.0.0", () => {
  console.log(
    `Servidor iniciado. Ouvindo na porta ${process.env.PORT || PORT}`
  );
});
