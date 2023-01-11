import express, { Express, Request, Response } from 'express';
import * as Eta from "eta"
import { getPool } from './db';
import { init } from './init';
import { copyFile } from 'fs';
import session from 'express-session';
import { OUT_FORMAT_OBJECT } from 'oracledb';
const bootstrap = async () => {
  init();

  // express settings
  const app: Express = express();
  app.use(express.json());
  app.use(express.urlencoded());
  app.use(session({
    resave: false,
    saveUninitialized: true,
    secret: 'very strong random secret'
  }));
  app.use('/styles', express.static('./styles'));
  app.use('/img', express.static('./img'));

  // eta settings
  app.engine("eta", Eta.renderFile);
  app.set("view engine", "eta");
  app.set("views", "./views");

  // routes
  app.get('/', (req: Request, res: Response) => {
    if(!req.session.username)
      res.render("welcome", {});
    else
      res.send(`signed as ${req.session.username}!`);
  });

  // forms
  app.post('/', async (req: Request, res: Response) => {
    if(!req.session.username){
      if(req.body.username){
        const username = req.body.username.toUpperCase();
        const reg = /^[A-Z]{1,255}$/;
        if(reg.test(username)){

          let pool, connection, result;
          try{
            pool = await getPool();
            connection = await pool.getConnection();
            result = (await connection.execute(`SELECT COUNT(*) AS n FROM uzytkownicy WHERE login=:login`, [username], { outFormat: OUT_FORMAT_OBJECT } )).rows;
            if(result){
              if(result[0]){
                if((result[0] as {n: number}).n !== 0){
                  await connection.execute(`INSERT INTO uzytkownicy (login, preferowana_jednostka) VALUES (:login, 'K')`, [username])
                }
                req.session.username = username;
                req.session.save();
                res.redirect('/');
              }else res.status(500)
            }else res.status(500)
          }catch(err){
            console.error(err);
            res.status(500);          
          }finally{
            await connection?.close();
            await pool?.close();
          }
        }else{
          res.render("welcome", {
            error: "Niepoprawny format nazwy użytkownika!",
            username: username
          });
        }
      }else{
        res.status(400);
      }
    }else{
      res.status(404);
    }
  });

  // listen
  const port = process.env.PORT;
  app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));
}

bootstrap();