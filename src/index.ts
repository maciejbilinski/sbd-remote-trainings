import express, { Express, Request, Response } from 'express';
import * as Eta from "eta"
import { getPool } from './db';
import { init } from './init';
import { copyFile } from 'fs';
import session from 'express-session';
import { OUT_FORMAT_ARRAY, OUT_FORMAT_OBJECT } from 'oracledb';
import fileUpload, { UploadedFile } from 'express-fileupload';
import path from 'path';

const boolToDB = (x: boolean) => {
  return (x ? 'T' : 'N');
}

const getExtension = (filename: string) => {
  const re = /(?:\.([^.]+))?$/;
  return re.exec(filename)![1];
}

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
  app.use('/scripts', express.static('./scripts'));
  app.use('/files', express.static('./files'));

  // eta settings
  app.engine("eta", Eta.renderFile);
  app.set("view engine", "eta");
  app.set("views", "./views");
  

  // Checks if user is logged in; if not, redirects to main page
  const checkLoggedIn = (req: Request, res: Response, next: Function) => {
    if(process.env.STILL_LOGGED_IN == "true"){
      req.session.username = "admin"
      req.session.save();
    }
    if(!req.session.username) {
      res.redirect('/');
    } else {
      next();
    }
  }

  // routes
  app.get('/', (req: Request, res: Response) => {
    if(process.env.STILL_LOGGED_IN == "true"){
      req.session.username = "admin"
      req.session.save();
    }
    if(!req.session.username)
      res.render("welcome", {});
    else
      res.render("cockpit", {username: req.session.username});
  });

  app.get('/created/:what', checkLoggedIn, (req: Request, res: Response) => {
    res.render('created', {
      what: req.params.what
    })
  });

  app.get('/training-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.send('Kreator treningów');
  });

  app.get('/exercise-creator', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT nazwa, ma_zdjecie FROM sprzet`, [], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){
          res.render("exercises_creator", {
            equipment: result
          });
        }else res.status(500)
    }catch(err){
      console.error(err);
      res.status(500);          
    }finally{
      await connection?.close();
      await pool?.close();
    }

    
  });

  app.get('/equipment-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.render("equipment_creator", {});
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
                if((result[0] as {N: number}).N === 0){
                  await connection.execute(`INSERT INTO uzytkownicy (login, preferowana_jednostka) VALUES (:login, 'K')`, [username], {autoCommit: true})
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

  app.post('/equipment-creator', checkLoggedIn, fileUpload(), async (req: Request, res: Response) => {
    if(req.body.name && req.body.type){
      if(['y', 'n'].includes(req.body.type)){
        let pool, connection, result;
        try{
          pool = await getPool();
          connection = await pool.getConnection();
          result = (await connection.execute(`SELECT COUNT(*) AS n FROM sprzet WHERE nazwa=:nazwa`, [req.body.name], { outFormat: OUT_FORMAT_OBJECT } )).rows;
          if(result){
            if(result[0]){
              if((result[0] as {N: number}).N === 0){
                var error = false;
                if(req.files?.photo){
                  const photo = (req.files.photo as UploadedFile);
                  const ext = getExtension(photo.name);
                  if(!['jpg', 'png', 'jpeg'].includes(ext)){
                    res.json({
                      error: "Niepoprawny format zdjęcia! Dozwolone to: 'jpg', 'png', 'jpeg'."
                    });
                    error = true;
                  }else{
                    photo.mv(path.join(__dirname, '..', 'files', 'equipment', req.body.name+"."+ext))
                  }
                }

                if(!error){
                  var data = [
                    req.body.name,
                    boolToDB(req.files?.photo !== undefined),
                    boolToDB(req.body.type === 'y')
                  ];
                  await connection.execute(`INSERT INTO sprzet (nazwa, ma_zdjecie, czy_rozne_obciazenie) VALUES (:nazwa, :ma_zdjecie, :czy_rozne_obciazenie)`, data, {autoCommit: true});
                  res.json({success: true, data: {
                    name: data[0],
                    photo: data[1],
                    type: data[2]
                  }});
                }
              }else{
                res.json({
                  error: "Ta nazwa jest już zajęta!"
                });
              }
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
        res.json({
          error: "Niepoprawna wartość pola \"Wykorzystuje obciążenie\"!"
        });
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!"
      });
    }
  });

  app.post('/exercise-creator', checkLoggedIn, fileUpload(), async (req: Request, res: Response) => {
    var equipment: string[] = [];
    Object.keys(req.body).forEach((key) => {
      if(key.startsWith("equipment-")){
        equipment.push(decodeURI(key.substring(10)))
      }
    })
    if(req.body.name && req.body.type){
      if(['y', 'n'].includes(req.body.type)){
        let pool, connection, result;
        try{
          pool = await getPool();
          connection = await pool.getConnection();
          result = (await connection.execute(`SELECT COUNT(*) AS n FROM cwiczenia WHERE nazwa=:nazwa`, [req.body.name], { outFormat: OUT_FORMAT_OBJECT } )).rows;
          if(result){
            if(result[0]){
              if((result[0] as {N: number}).N === 0){
                var error = false;
                if(req.files?.video){
                  const video = (req.files.video as UploadedFile);
                  const ext = getExtension(video.name);
                  if(!['mp4'].includes(ext)){
                    res.json({
                      error: "Niepoprawny format instruktażu! Dozwolone to: 'mp4'."
                    });
                    error = true;
                  }else{
                    video.mv(path.join(__dirname, '..', 'files', 'exercises', req.body.name+"."+ext))
                  }
                }

                if(!error){
                  var data = [
                    req.body.name,
                    boolToDB(req.files?.video !== undefined),
                    boolToDB(req.body.type === 'y')
                  ];
                  await connection.execute(`INSERT INTO cwiczenia (nazwa, ma_instruktaz, czy_powtorzeniowe) VALUES (:nazwa, :ma_instruktaz, :czy_powtorzeniowe)`, data, {autoCommit: false});
                  for(const equip of equipment){
                    result = (await connection.execute(`SELECT COUNT(*) AS n FROM sprzet WHERE nazwa=:nazwa`, [equip], { outFormat: OUT_FORMAT_OBJECT } )).rows;
                    if(result){
                      if(result[0]){
                        if((result[0] as {N: number}).N === 0){
                          error = true;
                          res.json({
                            error: 'Próbowano powiązać ćwiczenie z nieistniejącym sprzętem!'
                          })
                          break;
                        }
                      }
                    }
                    await connection.execute(`
                    INSERT INTO cwiczeniasprzet (cwiczenia_nazwa, sprzet_nazwa) VALUES (:1, :2)`, [
                      data[0], equip
                    ], {autoCommit: false});
                  }

                  if(!error){
                    await connection.commit();
                    res.json({
                      success: true,
                      data: {
                        name: data[0],
                        video: data[1],
                        type: data[2]
                      }
                    });
                  }

                }
              }else{
                res.json({
                  error: "Ta nazwa jest już zajęta!"
                });
              }
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
        res.json({
          error: "Niepoprawna wartość pola \"Typ ćwiczenia\"!"
        });
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!"
      });
    }
  });

  // listen
  const port = process.env.PORT;
  app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));
}

bootstrap();