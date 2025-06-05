import express, { Request, Response } from 'express';
import cors from 'cors';
import { rabbitMQService } from './services/RabbitMQProducerService';
import axios from 'axios';
import path from 'path';
import http from 'http';
import { WebSocket, WebSocketServer } from 'ws';
import amqp from 'amqplib';
import { stat } from 'fs';

const app = express();
const port = process.env.PORT || 3000;

// HTTP-Server erstellen
const server = http.createServer(app);

// WebSocket-Server einrichten
const wss = new WebSocketServer({ server, path: '/ws' });

// Aktive WebSocket-Verbindungen speichern
const clients = new Set<WebSocket>();

// An alle WebSocket-Clients senden
function broadcastToClients(data: any) {
    const message = JSON.stringify(data);
    console.log(`Sende an ${clients.size} Clients:`, message.slice(0, 100) + (message.length > 100 ? '...' : ''));
    
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    });
}

// Einfache Erfolgsmeldung senden
function sendSuccessMessage(ws: WebSocket, message: string) {
    ws.send(JSON.stringify({
        type: 'success',
        message: message
    }));
}

// RabbitMQ Event Listening Channel
let eventChannel: amqp.Channel | null = null;
let statusChannel: amqp.Channel | null = null;

// RabbitMQ für Events einrichten
async function setupRabbitMQEventListener() {
    try {
        console.log('Stelle Verbindung zu RabbitMQ für Event-Listening her...');
        const connection = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://rabbitmq:5672');
        eventChannel = await connection.createChannel();
        statusChannel = await connection.createChannel();
        console.log('RabbitMQ-Verbindung für Events hergestellt');
        
        // Exchanges für Status-Events erstellen/sicherstellen
        await statusChannel.assertExchange('lamp.status.exchange', 'fanout', { durable: false });
        await eventChannel.assertExchange('lamp.morse.exchange', 'fanout', { durable: false });
        await eventChannel.assertExchange('lamp.commands.exchange', 'fanout', { durable: false });
        console.log('Exchanges erstellt');
        
        // Queue für Status-Events erstellen
        const statusQueue = await statusChannel.assertQueue('', { exclusive: true });
        await statusChannel.bindQueue(statusQueue.queue, 'lamp.status.exchange', '');
        console.log('Status-Queue erstellt und gebunden');
        
        // Queue für Morse-Events erstellen
        const morseQueue = await eventChannel.assertQueue('', { exclusive: true });
        await eventChannel.bindQueue(morseQueue.queue, 'lamp.morse.exchange', '');
        console.log('Morse-Queue erstellt und gebunden');
        
        // Status-Events abonnieren
        statusChannel.consume(statusQueue.queue, (msg) => {
            if (msg) {
                try {
                    const statusData = JSON.parse(msg.content.toString());
                    console.log('Status-Event erhalten:', statusData);
                    
                    // An alle WebSocket-Clients weiterleiten
                    broadcastToClients({
                        type: 'getStatus',
                        state: statusData
                    });
                } catch (err) {
                    console.error('Fehler beim Verarbeiten des Status-Events:', err);
                }
                statusChannel?.ack(msg);
            }
        });
        console.log('Status-Events werden empfangen');
        
        // Morse-Events abonnieren
        eventChannel.consume(morseQueue.queue, (msg) => {
            if (msg) {
                try {
                    const morseData = JSON.parse(msg.content.toString());
                    console.log('Morse-Event erhalten:', morseData);
                    
                    // An alle WebSocket-Clients weiterleiten
                    broadcastToClients({
                        type: 'morseUpdate',
                        ...morseData
                    });
                } catch (err) {
                    console.error('Fehler beim Verarbeiten des Morse-Events:', err);
                }
                eventChannel?.ack(msg);
            }
        });
        console.log('Morse-Events werden empfangen');
        
        console.log('RabbitMQ Event Listener erfolgreich eingerichtet');
    } catch (error) {
        console.error('Fehler beim Einrichten des RabbitMQ Event Listeners:', error);
        // Nach kurzer Zeit erneut versuchen
        setTimeout(setupRabbitMQEventListener, 5000);
    }
}

// Statische HTML-Auslieferung
app.use('/', express.static(path.join(__dirname, '../Frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../Frontend/index.html'));
});

// Middleware
app.use(cors());
app.use(express.json());

// Connect to RabbitMQ
Promise.all([
    rabbitMQService.connect(),
    setupRabbitMQEventListener()
]).catch(console.error);

// WebSocket-Verbindungen verwalten
wss.on('connection', (ws) => {
    console.log('Neue WebSocket-Verbindung');
    clients.add(ws);
    
    // Status anfordern, wenn ein neuer Client verbunden ist
    rabbitMQService.requestStatus().catch(err => {
        console.error('Fehler beim Anfordern des Status für neuen Client:', err);
    });
    
    // Nachrichten vom Client verarbeiten
    ws.on('message', async (message) => {
        try {
            const data = JSON.parse(message.toString());
            console.log('WebSocket-Nachricht erhalten:', data);
            
            // Befehlsverarbeitung mit switch-case
            switch(data.command) {
                case 'getStatus':
                    try {
                        // Status-Event über RabbitMQ anfordern
                        await rabbitMQService.requestStatus();
                        sendSuccessMessage(ws, 'Status wird abgefragt...');
                    } catch (err) {
                        console.error('Fehler beim Anfordern des Status:', err);
                        ws.send(JSON.stringify({
                            type: 'error',
                            message: 'Statusabfrage fehlgeschlagen'
                        }));
                    }
                    break;
                    
                case 'on':
                    await rabbitMQService.turnOn();
                    sendSuccessMessage(ws, 'Lampe wird eingeschaltet...');
                    break;
                    
                case 'off':
                    await rabbitMQService.turnOff();
                    sendSuccessMessage(ws, 'Lampe wird ausgeschaltet...');
                    break;
                    
                case 'brightness':
                    await rabbitMQService.setBrightness(data.value);
                    sendSuccessMessage(ws, `Helligkeit wird auf ${data.value}% gesetzt...`);
                    break;
                    
                case 'color':
                    await rabbitMQService.setColor(data.value);
                    sendSuccessMessage(ws, `Farbe wird auf ${data.value} gesetzt...`);
                    break;
                    
                case 'morse':
                    await rabbitMQService.sendMorseMessage(data.value);
                    sendSuccessMessage(ws, 'Morsecode wird gesendet...');
                    break;
                    
                default:
                    ws.send(JSON.stringify({
                        type: 'error',
                        message: 'Unbekannter Befehl: ' + data.command
                    }));
                    break;
            }
        } catch (error) {
            console.error('Fehler bei der Verarbeitung der WebSocket-Nachricht:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Fehler bei der Verarbeitung der Anfrage'
            }));
        }
    });
    
    // Verbindung geschlossen
    ws.on('close', () => {
        console.log('WebSocket-Verbindung geschlossen');
        clients.delete(ws);
    });
});

// Alte REST-API-Endpunkte behalten wir zur Kompatibilität bei
app.post('/api/lamp/on', async (req: Request, res: Response) => {
    try {
        await rabbitMQService.turnOn();
        res.json({ success: true, message: 'Lamp turned on' });
    } catch (error) {
        console.error('Error turning on lamp:', error);
        res.status(500).json({ success: false, error: 'Failed to turn on lamp' });
    }
});

app.post('/api/lamp/off', async (req: Request, res: Response) => {
    try {
        await rabbitMQService.turnOff();
        res.json({ success: true, message: 'Lamp turned off' });
    } catch (error) {
        console.error('Error turning off lamp:', error);
        res.status(500).json({ success: false, error: 'Failed to turn off lamp' });
    }
});

app.post('/api/lamp/brightness', async (req: Request, res: Response) => {
    try {
        const { value } = req.body;
        if (typeof value !== 'number' || value < 0 || value > 100) {
            return res.status(400).json({ success: false, error: 'Brightness must be a number between 0 and 100' });
        }
        await rabbitMQService.setBrightness(value);
        res.json({ success: true, message: `Brightness set to ${value}%` });
    } catch (error) {
        console.error('Error setting brightness:', error);
        res.status(500).json({ success: false, error: 'Failed to set brightness' });
    }
});

app.post('/api/lamp/color', async (req: Request, res: Response) => {
    try {
        const { value } = req.body;
        if (typeof value !== 'string' || !/^#[0-9A-F]{6}$/i.test(value)) {
            return res.status(400).json({ success: false, error: 'Color must be a valid hex color (e.g., #FF0000)' });
        }
        await rabbitMQService.setColor(value);
        res.json({ success: true, message: `Color set to ${value}` });
    } catch (error) {
        console.error('Error setting color:', error);
        res.status(500).json({ success: false, error: 'Failed to set color' });
    }
});

app.post('/api/lamp/morse', async (req, res) => {
    const { message } = req.body;
    if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Ungültige Nachricht" });
    }

    await rabbitMQService.sendMorseMessage(message);
    res.json({ success: true, message: "Morsecode wird gesendet" });
});

// REST-Endpunkt für Status (zur Kompatibilität)
app.get('/lamp/status', async (req, res) => {
    try {
        const response = await axios.get('http://consumer:4000/lamp/status');
        res.json(response.data);
    } catch (err) {
        console.error('Fehler beim Weiterleiten der Statusabfrage:', err);
        res.status(500).json({ error: 'Consumer nicht erreichbar' });
    }
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// Server starten
server.listen(port, () => {
    console.log(`Server läuft auf Port ${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    if (eventChannel) {
        await eventChannel.close();
    }
    await rabbitMQService.disconnect();
    process.exit(0);
});