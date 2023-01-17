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

  // Checks if user is logged in; if not, redirects to main page
  const checkLoggedIn = (req: Request, res: Response, next: Function) => {
    if(!req.session.username) {
      res.redirect('/');
    } else {
      next();
    }
  }

  // routes
  app.get('/', (req: Request, res: Response) => {
    if(!req.session.username)
      res.render("welcome", {});
    else
      res.render("cockpit", {username: req.session.username});
  });

  app.get('/training-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Kreator treningów');
  });

  app.get('/exercise-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Kreator ćwiczeń');
  });

  app.get('/equipment-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Kreator sprzętu');
  });

  app.get('/training-search', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Wyszukiwarka treningów');
  });

  app.get('/exercise-search', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Wyszukiwarka ćwiczeń');
  });

  app.get('/training-plans', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Plany treningowe użytkownika');
  });

  app.get('/equipment-search', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Wyszukiwarka sprzętu');
  });

  app.get('/account-settings', checkLoggedIn, async (req: Request, res: Response) => {
    if (!req.session.unit) {
      const username = req.session.username;
      let pool, connection, result;
      try {
        pool = await getPool();
        connection = await pool.getConnection();
        result = (await connection.execute(`SELECT preferowana_jednostka FROM uzytkownicy WHERE login=:login`, [username], { outFormat: OUT_FORMAT_OBJECT })).rows;
        if (result) {
          if (result[0]) {
            req.session.unit = (result[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA;
            req.session.save();
          }
        }
      } catch (err) {
        console.error(err);
        res.status(500);          
      } finally {
        await connection?.close();
        await pool?.close();
      }
    } else {
      res.render('account-settings', { username: req.session.username, unit: req.session.unit });
    }
  });

  // Handle logout
  app.get('/logout', checkLoggedIn, (req: Request, res: Response) => {
    req.session.destroy(err => {
      if (err) {
        res.send('Błąd podczas wylogowywania!');
      } else {
        res.redirect('/');
      }
    });
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