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
    user: "tbnet",
    password: "tbnet123",
    database: "iot",
    port: 5433
})

/* MQTT */

const mqttClient = mqtt.connect("mqtts://ippbx.vnpt.vn:80", {
    username: "ebutton01",
    password: "Btn@dmo728"
})

mqttClient.on("connect", () => {
    console.log("MQTT connected")
    mqttClient.subscribe("/tbnet/data")
})

mqttClient.on("error", err => {
    console.log("MQTT error:", err)
})

/* MQTT message */

mqttClient.on("message", async (topic, message) => {

    try {

        const raw = JSON.parse(message.toString())

        const payload = raw.data.payload

        const data = {
            serial: raw.header.serial_number,
            battery: payload.power.battery_level,
            charging: payload.power.charging_status,
            source: payload.power.source,
            temp_cpu: parseFloat(payload.power.temp_cpu),
            temp_board: parseFloat(payload.power.temp_board),
            wifi: payload.connection.wifi.rssi,
            g4: payload.connection.cellular.rssi,
            no_status: payload.no_status,
            nc_status: payload.nc_status,
            active_interface: payload.connection.active_interface
        }

        console.log("MQTT DATA:", data)

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

/* broadcast */

function broadcast(data) {

    wss.clients.forEach(client => {

        if (client.readyState === WebSocket.OPEN) {

            client.send(JSON.stringify(data))

        }

    })

}

/* start */

server.listen(8080, "0.0.0.0", () => {
    console.log("Server running http://152.42.216.220:8080")
})