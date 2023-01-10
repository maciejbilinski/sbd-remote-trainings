import express, { Express, Request, Response } from 'express';
import * as Eta from "eta"
import { getPool } from './db';
import { init } from './init';

const bootstrap = async () => {
  init();

  // express settings
  const app: Express = express();
  app.use('/styles', express.static('./styles'));

  // eta settings
  app.engine("eta", Eta.renderFile);
  app.set("view engine", "eta");
  app.set("views", "./views");

  // routes
  app.get('/', async (_: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT table_name FROM user_tables`)).rows;
    }catch(err){
      console.error(err);
    }finally{
      await connection?.close();
      await pool?.close();
    }

    if(result){
      res.render("test", {
        tables: result
      });
    }else{
      res.status(500);
    }
  });

  // listen
  const port = process.env.PORT;
  app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));
}

bootstrap();