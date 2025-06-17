import { createClient } from 'redis';
import logger from '../utils/logger';

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      // Only try to reconnect 3 times
      if (retries > 3) {
        logger.warn('Redis connection failed after 3 retries, disabling cache');
        return new Error('Redis connection failed');
      }
      return Math.min(retries * 100, 3000);
    }
  }
});

redisClient.on('error', (err) => {
  // Only log the error if it's not a connection refused error
  if (!err.message.includes('ECONNREFUSED')) {
    logger.error('Redis Client Error:', err);
  }
});

export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error('Cache get error:', error);
    return null;
  }
}

export async function setCache(key: string, value: any, ttlSeconds: number = 3600): Promise<void> {
  try {
    await redisClient.set(key, JSON.stringify(value), {
      EX: ttlSeconds
    });
  } catch (error) {
    logger.error('Cache set error:', error);
  }
}

export async function deleteCache(key: string): Promise<void> {
  try {
    await redisClient.del(key);
  } catch (error) {
    logger.error('Cache delete error:', error);
  }
}

// Initialize Redis connection
export async function initCache(): Promise<void> {
  try {
    await redisClient.connect();
    logger.info('Redis cache connected');
    console.log('Redis cache connected');
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    console.log('Failed to connect to Redis:', error);
  }
} 