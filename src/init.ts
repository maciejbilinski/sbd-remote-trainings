import dotenv from 'dotenv';
import { initOracleClient } from 'oracledb';

export const init = () => {
    // init .env
    dotenv.config();
    
    // init oracle db
    initOracleClient({ libDir: process.env.ORACLE_CLIENT_PATH });
}
