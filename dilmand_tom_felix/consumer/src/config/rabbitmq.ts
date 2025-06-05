// src/config/rabbitmq.config.ts
import amqp from 'amqplib';

export const rabbitMQConfig = {
    hostname: process.env.RABBITMQ_HOST || 'localhost',
    port: parseInt(process.env.RABBITMQ_PORT || '5672', 10),
    username: process.env.RABBITMQ_USER || 'guest',
    password: process.env.RABBITMQ_PASS || 'guest',
    lampCommandQueue: process.env.LAMP_COMMAND_QUEUE || 'lamp-commands',
    lampStatusQueue: process.env.LAMP_STATUS_QUEUE || 'lamp-status',
};
// Separate Verbindungen und Channels für Command und Status
let commandConnection: amqp.ChannelModel | null = null;
let commandChannel: amqp.Channel | null = null;
let statusConnection: amqp.ChannelModel | null = null;
let statusChannel: amqp.Channel | null = null;

// Die bestehende Funktion für Command-Channel
export async function createRabbitMQChannel(): Promise<amqp.Channel> {
    // Bestehender Code für Command Channel
    if (commandChannel) {
        return commandChannel;
    }
    try {
        const connUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";
        commandConnection = await amqp.connect(connUrl);
        
        if (!commandConnection) {
            throw new Error('Failed to connect to RabbitMQ');
        } 
        console.log('Successfully connected to RabbitMQ for commands');

        commandConnection.on('error', (err) => {
            console.error('RabbitMQ command connection error', err);
            commandConnection = null;
            commandChannel = null;
        });

        commandConnection.on('close', () => {
            console.warn('RabbitMQ command connection closed');
            commandConnection = null;
            commandChannel = null;
        });

        commandChannel = await commandConnection.createChannel();
        if (!commandChannel) {
            commandChannel = null;
            if (commandConnection) {
                await commandConnection.close();
                commandConnection = null;
            }
            throw new Error('Failed to create RabbitMQ command channel');
        }
        console.log('RabbitMQ command channel created');
        await commandChannel.assertQueue(rabbitMQConfig.lampCommandQueue, { durable: false });
        return commandChannel;
    } catch (error) {
        console.error('Failed to connect to RabbitMQ or create command channel:', error);
        if (commandConnection) {
            await commandConnection.close();
            commandConnection = null;
        }
        commandChannel = null;
        throw error;
    }
}

// Neue Funktion für Status-Channel
export async function createStatusChannel(): Promise<amqp.Channel> {
    if (statusChannel) {
        return statusChannel;
    }
    try {
        const connUrl = process.env.RABBITMQ_URL || "amqp://localhost:5672";
        statusConnection = await amqp.connect(connUrl);
        
        if (!statusConnection) {
            throw new Error('Failed to connect to RabbitMQ for status updates');
        } 
        console.log('Successfully connected to RabbitMQ for status updates');

        statusConnection.on('error', (err) => {
            console.error('RabbitMQ status connection error', err);
            statusConnection = null;
            statusChannel = null;
        });

        statusConnection.on('close', () => {
            console.warn('RabbitMQ status connection closed');
            statusConnection = null;
            statusChannel = null;
        });

        statusChannel = await statusConnection.createChannel();
        if (!statusChannel) {
            statusChannel = null;
            if (statusConnection) {
                await statusConnection.close();
                statusConnection = null;
            }
            throw new Error('Failed to create RabbitMQ status channel');
        }
        console.log('RabbitMQ status channel created');
        
        // Status Exchange erstellen
        await statusChannel.assertExchange('lamp.status.exchange', 'fanout', { durable: false });
        // Morse Exchange erstellen
        await statusChannel.assertExchange('lamp.morse.exchange', 'fanout', { durable: false });
        
        console.log('Status and Morse exchanges created');
        
        return statusChannel;
    } catch (error) {
        console.error('Failed to connect to RabbitMQ or create status channel:', error);
        if (statusConnection) {
            await statusConnection.close();
            statusConnection = null;
        }
        statusChannel = null;
        throw error;
    }
}

export async function closeRabbitMQConnection(): Promise<void> {
    // Schließe Command-Channel und -Verbindung
    if (commandChannel) {
        await commandChannel.close();
        commandChannel = null;
    }
    if (commandConnection) {
        await commandConnection.close();
        commandConnection = null;
    }
    
    // Schließe Status-Channel und -Verbindung
    if (statusChannel) {
        await statusChannel.close();
        statusChannel = null;
    }
    if (statusConnection) {
        await statusConnection.close();
        statusConnection = null;
    }
    
    console.log('All RabbitMQ connections and channels closed');
}