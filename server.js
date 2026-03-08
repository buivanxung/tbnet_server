const express = require("express")
const http = require("http")
const WebSocket = require("ws")
const mqtt = require("mqtt")
const { Pool } = require("pg")

const app = express()
const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

app.use(express.static("public"))

/* ---------------- POSTGRES ---------------- */

const pool = new Pool({
    host: "localhost",
    user: "tbnet",
    password: "tbnet123",
    database: "iot",
    port: 5433
})

/* ---------------- MQTT ---------------- */

const mqttClient = mqtt.connect("mqtts://ippbx.vnpt.vn:80", {
    username: "ebutton01",
    password: "Btn@dmo728",
    reconnectPeriod: 5000
})

mqttClient.on("connect", () => {

    console.log("MQTT connected")

    mqttClient.subscribe("/tbnet/data")

})

mqttClient.on("error", err => {

    console.log("MQTT error:", err)

})

/* ---------------- MQTT MESSAGE ---------------- */

mqttClient.on("message", async (topic, message) => {

    let raw

    try {

        const text = message.toString().trim()

        if (!text) {
            console.log("Empty MQTT message")
            return
        }

        raw = JSON.parse(text)

    } catch (err) {

        console.log("Invalid JSON:", message.toString())
        return

    }

    const event = raw?.data?.event_type
    const payload = raw?.data?.payload ?? {}

    /* ================= HEARTBEAT ================= */

    if (event === "status_heartbeat") {

        const power = payload?.power ?? {}
        const conn = payload?.connection ?? {}

        const data = {

            serial: raw?.header?.serial_number ?? null,

            battery: power?.battery_level ?? null,
            charging: power?.charging_status ?? null,
            source: power?.source ?? null,

            temp_cpu: power?.temp_cpu ? parseFloat(power.temp_cpu) : null,
            temp_board: power?.temp_board ? parseFloat(power.temp_board) : null,

            wifi: conn?.wifi?.rssi ?? null,
            wifi_ssid: conn?.wifi?.ssid ?? null,

            g4: conn?.cellular?.rssi ?? null,
            operator: conn?.cellular?.operator ?? null,

            no_status: payload?.no_status ?? null,
            nc_status: payload?.nc_status ?? null,

            active_interface: conn?.active_interface ?? null
        }

        console.log("HEARTBEAT:", data)

        try {

            await pool.query(
                `INSERT INTO device_data(
                serial,
                battery,
                charging,
                source,
                temp_cpu,
                temp_board,
                wifi,
                wifi_ssid,
                g4,
                operator,
                no_status,
                nc_status,
                active_interface
            )
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
                [
                    data.serial,
                    data.battery,
                    data.charging,
                    data.source,
                    data.temp_cpu,
                    data.temp_board,
                    data.wifi,
                    data.wifi_ssid,
                    data.g4,
                    data.operator,
                    data.no_status,
                    data.nc_status,
                    data.active_interface
                ]
            )

        } catch (err) {

            console.log("DB insert error:", err)

        }

        broadcast(data)

    }

    /* ================= FIRE ALARM ================= */

    else if (event === "fire_alarm") {

        const alarm = {

            type: "fire_alarm",

            serial: raw?.header?.serial_number,

            source: payload?.source,
            zone: payload?.zone,
            status: payload?.status,
            description: payload?.description
        }

        console.log("🔥 FIRE ALARM:", alarm)

        try {

            await pool.query(
                `INSERT INTO fire_alarm(
                serial,
                source,
                zone,
                status,
                description
            )
            VALUES($1,$2,$3,$4,$5)`,
                [
                    alarm.serial,
                    alarm.source,
                    alarm.zone,
                    alarm.status,
                    alarm.description
                ]
            )

        } catch (err) {

            console.log("DB alarm insert error:", err)

        }

        broadcast(alarm)

    }

})

/* ---------------- WEBSOCKET ---------------- */

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

        console.log("DB read error:", err)

    }

})

/* ---------------- BROADCAST ---------------- */

function broadcast(data) {

    const msg = JSON.stringify(data)

    wss.clients.forEach(client => {

        if (client.readyState === WebSocket.OPEN) {

            client.send(msg)

        }

    })

}

/* ---------------- SERVER START ---------------- */

server.listen(8080, "0.0.0.0", () => {

    console.log("Server running http://152.42.216.220:8080")

})