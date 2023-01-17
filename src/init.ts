import dotenv from 'dotenv';
import { initOracleClient } from 'oracledb';

declare module 'express-session' {
    interface SessionData {
      username: string;
      unit: string;
    }
  }

export const init = () => {
    // init .env
    dotenv.config();
    
    // init oracle db
    initOracleClient({ libDir: process.env.ORACLE_CLIENT_PATH });
}
