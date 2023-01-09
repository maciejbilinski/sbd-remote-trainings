import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import {initOracleClient, createPool} from 'oracledb';

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

initOracleClient({libDir: process.env.ORACLE_CLIENT_PATH});

async function run() {
  let pool, result;

  try {
    pool = await createPool({
      user          : process.env.DB_USER,
      password      : process.env.DB_USER,
      connectString : "admlab2.cs.put.poznan.pl:1521/dblab02_students.cs.put.poznan.pl",
    });

    let connection;
    try {
      connection = await pool.getConnection();
      result = await connection.execute(`SELECT table_name FROM user_tables`);
      console.log("Result is:", result);
    } catch (err) {
      throw (err);
    } finally {
      if (connection) {
        try {
          await connection.close(); // Put the connection back in the pool
        } catch (err) {
          throw (err);
        }
      }
    }
  } catch (err: any) {
    console.error(err.message);
  } finally {
    await pool?.close();
  }
}


run().then(() => {
    console.log("Data Source has been initialized!");

    app.get('/', (req: Request, res: Response) => {
    });
    
    app.listen(port, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });

}).catch((err) => {
    console.error("Error during Data Source initialization", err);
});