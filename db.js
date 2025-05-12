const mysql = require('mysql2');
require('dotenv').config();

// Créer un pool de connexions
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10, // Limite de connexions simultanées
    queueLimit: 0,
    supportBigNumbers: true,
    bigNumberStrings: true
});

// Utiliser le pool pour la gestion des requêtes
const promisePool = pool.promise();

// Exporter le pool
module.exports = { pool, promisePool };