
import {RabbitMQConsumerService} from './services/RabbitMQConsumerService';
import {closeRabbitMQConnection} from './config/rabbitmq';
import { createTplinkDeviceConnection } from './config/tplink';
import { MockLampDevice } from './config/mockLamp';


async function main() {
    const device = new MockLampDevice();
    if (!device) {
        console.log("Failed to create TP-Link device connection.");
    }
    const consumer = new RabbitMQConsumerService(device);
    await consumer.start();

    process.on('SIGINT', async () => {
        console.log("Shutting down...");
        await consumer.stop();
        await closeRabbitMQConnection();
        process.exit(0);
    });
}

main();