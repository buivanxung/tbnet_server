const express = require("express")
const http = require("http")
const WebSocket = require("ws")
const mqtt = require("mqtt")
const { Pool } = require("pg")

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

app.use(express.static("public"))

/* PostgreSQL */

const pool = new Pool({
    host: "localhost",
    user: "postgres",
    password: "88888888",
    database: "iot",
    port: 5432
})

/* MQTT */

const mqttClient = mqtt.connect("mqtt://ippbx.vnpt.vn:80", {
    username: "ebutton01",
    password: "Btn@dmo728"
})

mqttClient.on("connect", () => {
    console.log("MQTT connected")
    mqttClient.subscribe("device/data")
})

/* MQTT message */

mqttClient.on("message", async (topic, message) => {

    try {

        let data = JSON.parse(message.toString())

        await pool.query(
            `INSERT INTO device_data(
serial,
battery,
charging,
source,
temp_cpu,
temp_board,
wifi,
g4,
no_status,
nc_status,
active_interface
)
VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
                data.serial,
                data.battery,
                data.charging,
                data.source,
                data.temp_cpu,
                data.temp_board,
                data.wifi,
                data.g4,
                data.no_status,
                data.nc_status,
                data.active_interface
            ]
        )

        broadcast(data)

    } catch (err) {
        console.log("MQTT parse error", err)
    }

})

/* WebSocket */

wss.on("connection", async (ws) => {

    console.log("Dashboard connected")

    try {

        const result = await pool.query(
            `SELECT * FROM device_data
ORDER BY id DESC
LIMIT 1`
        )

        if (result.rows.length > 0) {

            ws.send(JSON.stringify(result.rows[0]))

        }

    } catch (err) {

        console.log(err)

    }

})

/* broadcast realtime */

function broadcast(data) {

    wss.clients.forEach(client => {

        if (client.readyState === WebSocket.OPEN) {

            client.send(JSON.stringify(data))

        }

    })

}

/* start */

server.listen(8080, () => {
    console.log("Server running http://localhost:3000")
})