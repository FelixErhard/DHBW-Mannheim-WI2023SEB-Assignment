import express, { Request, Response } from 'express';
import cors from 'cors';
import { rabbitMQService } from './services/RabbitMQProducerService';

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to RabbitMQ
rabbitMQService.connect().catch(console.error);

// API Routes
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

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.json({ status: 'ok' });
});

// Start the server
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('Shutting down...');
    await rabbitMQService.disconnect();
    process.exit(0);
});
