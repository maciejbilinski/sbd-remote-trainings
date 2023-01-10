import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import { initOracleClient, createPool } from 'oracledb';
import * as Eta from "eta"

dotenv.config();

const app: Express = express();
app.use('/styles', express.static('./styles'));
app.engine("eta", Eta.renderFile);
const port = process.env.PORT;
app.set("view engine", "eta");
app.set("views", "./views");

initOracleClient({ libDir: process.env.ORACLE_CLIENT_PATH });

async function run() {
  let pool, result;

  try {

    pool = await createPool({
      user: process.env.DB_USER,
      password: process.env.DB_USER,
      connectString: "admlab2.cs.put.poznan.pl:1521/dblab02_students.cs.put.poznan.pl",
    });

    let connection;
    try {
      connection = await pool.getConnection();
      result = await connection.execute(`SELECT table_name FROM user_tables`);
    } catch (err) {
      throw err;
    } finally {
      if (connection) {
        try {
          await connection.close();
        } catch (err) {
          throw err;
        }
      }
    }
  } catch (err: any) {
    console.error(err.message);
    throw err;
  } finally {
    await pool?.close();
  }
  return result?.rows;
}


run().then((result) => {
  console.log("Data Source has been initialized!");

  app.get('/', (_: Request, res: Response) => {
    res.render("test", {
      tables: result
    });
  });

  app.listen(port, () => {
    console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
  });

}).catch((err) => {
  console.error("Error during Data Source initialization", err);
});