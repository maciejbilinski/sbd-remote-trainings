import express, { Express, Request, Response } from 'express';
import * as Eta from "eta"
import { getPool } from './db';
import { init } from './init';
import { copyFile } from 'fs';
import session from 'express-session';
import { BIND_OUT, NUMBER, OUT_FORMAT_ARRAY, OUT_FORMAT_OBJECT } from 'oracledb';
import fileUpload, { UploadedFile } from 'express-fileupload';
import path from 'path';
import { traceDeprecation } from 'process';

function padTo2Digits(num: number) {
  return num.toString().padStart(2, '0');
}

function translateNumberToHour(value: number){
  var minutes = value % 60;
  var hours = (value-minutes)/60;
  return `${padTo2Digits(hours)}:${padTo2Digits(minutes)}`
}

function translateHourToNumber(value: string){
  var parts = value.split(':');
  var hours = parseInt(parts[0])
  var minutes = parseInt(parts[1])
  return hours*60+minutes
}

function formatDate(date = new Date()) {
  return [
    date.getFullYear(),
    padTo2Digits(date.getMonth() + 1),
    padTo2Digits(date.getDate()),
  ].join('-');
}

const boolToDB = (x: boolean) => {
  return (x ? 'T' : 'N');
}

const getExtension = (filename: string) => {
  const re = /(?:\.([^.]+))?$/;
  return re.exec(filename)![1];
}

const daysOfWeek = ['PN', 'WT', 'SR', 'CZ', 'PT', 'SB', 'ND'];

const bootstrap = async () => {
  init();

  // express settings
  const app: Express = express();
  app.use(express.json());
  app.use(express.urlencoded({extended: true}));
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
    res.render('info', {
      info: 'Dodano',
      what: req.params.what
    })
  });

  app.get('/modified/:what', checkLoggedIn, (req: Request, res: Response) => {
    res.render('info', {
      info: 'Zmieniono',
      what: req.params.what
    })
  });

  app.get('/training-creator', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT nazwa FROM cwiczenia`, [], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){
          
          let result2 = (await connection.execute(`SELECT nazwa, ma_zdjecie FROM sprzet`, [], { outFormat: OUT_FORMAT_ARRAY } )).rows;
          if(result2){
            res.render("training_creator", {
              exercises: result.flat(),
              equipment: result2
            });
            }else res.status(500)
        }else res.status(500)
    }catch(err){
      console.error(err);
      res.status(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }

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
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }

    
  });

  app.get('/equipment-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.render("equipment_creator", {});
  });

  app.get('/training-plan-creator/new-:training', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT czy_prywatny, uzytkownicy_login FROM treningi WHERE nazwa=:nazwa`, [req.params.training], { outFormat: OUT_FORMAT_OBJECT } )).rows;

      if(result){
        if(result.length === 0){
          res.render('error', {
            msg: 'Taki trening nie istnieje.'
          })
        }else{
          const data = result[0] as {
            CZY_PRYWATNY: string,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username && data.CZY_PRYWATNY === 'T'){
            res.render('error', {
              msg: 'Niestety ten trening nie należy do ciebie i jest prywatny.'
            })
          }else{
            res.render('training_plan_creator', {})
          }
        }
          
      }else res.status(500)
    }catch(err){
      console.error(err);
      res.status(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/training-plan-creator/modify-:id', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT data_zakonczenia, uzytkownicy_login FROM plantreningowy WHERE id=:id`, [req.params.id], { outFormat: OUT_FORMAT_OBJECT } )).rows;

      if(result){
        if(result.length === 0){
          res.render('error', {
            msg: 'Taki plan treningowy nie istnieje.\nMożliwe, że został usunięty niedawno w równoległej sesji.'
          })
        }else{
          const data = result[0] as {
            DATA_ZAKONCZENIA: Date|null,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username){
            res.render('error', {
              msg: 'Niestety ten plan treningowy nie należy do ciebie.\nDlatego nie możesz go modyfikować.'
            })
          }else{
            if(data.DATA_ZAKONCZENIA !== null && data.DATA_ZAKONCZENIA < (new Date())){
              res.render('error', {
                msg: 'Niestety ten plan treningowy jest już zakończony.\nDlatego nie możesz go modyfikować.\nProponujemy stworzyć nowy.'
              })
            }else{
              result = (await connection.execute(`SELECT dzien_tygodnia, godzina, dzien_tyg_przypomnienia, godz_przypomnienia FROM DNITRENINGOWE WHERE PLANTRENINGOWY_ID=:id`, [req.params.id], { outFormat: OUT_FORMAT_OBJECT } )).rows;
              if(result){
                const days = result as {
                  DZIEN_TYGODNIA: string,
                  GODZINA: number,
                  DZIEN_TYG_PRZYPOMNIENIA: string|null,
                  GODZ_PRZYPOMNIENIA: number|null
                }[];
                res.render('training_plan_creator', {
                  days: days.map((element) => [
                    element.DZIEN_TYGODNIA,
                    translateNumberToHour(element.GODZINA),
                    element.DZIEN_TYG_PRZYPOMNIENIA !== null && element.GODZ_PRZYPOMNIENIA !== null,
                    element.DZIEN_TYG_PRZYPOMNIENIA == null ? undefined : element.DZIEN_TYG_PRZYPOMNIENIA,
                    element.GODZ_PRZYPOMNIENIA === null ? undefined : translateNumberToHour(element.GODZ_PRZYPOMNIENIA ),
                  ]),
                  end: data.DATA_ZAKONCZENIA === null ? undefined : formatDate(data.DATA_ZAKONCZENIA)
                })
              }else res.status(500)
            }
          }
        }
          
      }else res.status(500)
    }catch(err){
      console.error(err);
      res.status(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/training-search', checkLoggedIn, async (req: Request, res: Response) => {
    const username = req.session.username;
    let pool, connection, result;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT * FROM treningi WHERE czy_prywatny='N' OR uzytkownicy_login=:login`, [username], { outFormat: OUT_FORMAT_ARRAY })).rows;
      if (result) {
        res.render('training-search', { username: req.session.username, table: result });
      }
    } catch (err) {
      console.error(err);
      res.status(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/training-panel', checkLoggedIn, async (req: Request, res: Response) => {
    const trainingName = req.query.name;
    const trainingAuthor = req.query.author;
    const username = req.session.username;
    let pool, connection, result;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT COUNT(*) AS n FROM treningi WHERE nazwa=:nazwa AND uzytkownicy_login=:login AND (czy_prywatny='N' OR uzytkownicy_login=:userlogin)`, [trainingName, trainingAuthor, username], { outFormat: OUT_FORMAT_OBJECT })).rows;
      if (result) {
        if (result[0]) {
          if ((result[0] as { N: number }).N === 1) {
            res.render('training-panel', { username: username, trainingName: trainingName, trainingAuthor: trainingAuthor});
          } else {
            res.redirect('/');
          }
        }
      }
    } catch (err) {
      console.error(err);
      res.status(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
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
      const username = req.session.username;
      let pool, connection, result;
      try {
        pool = await getPool();
        connection = await pool.getConnection();
        result = (await connection.execute(`SELECT preferowana_jednostka FROM uzytkownicy WHERE login=:login`, [username], { outFormat: OUT_FORMAT_OBJECT })).rows;
        if (result) {
          if (result[0]) {
            res.render('account-settings', { username: req.session.username, unit: (result[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA});
          }
        }
      } catch (err) {
        console.error(err);
        res.status(500);          
        res.send('Błąd wewnętrzny')       
      } finally {
        await connection?.close();
        await pool?.close();
      }
  });

  app.get('/delete-account', checkLoggedIn, (req: Request, res: Response) => {
    res.render('delete-account', {username: req.session.username});
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
            res.send('Błąd wewnętrzny')       
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

  app.post('/account-settings', checkLoggedIn, async (req: Request, res: Response) => {
    if (req.body.unit) {
      if(['K', 'L'].includes(req.body.unit)) {
        const username = req.session.username;
        const new_unit = req.body.unit;
        let pool, connection, previous_unit, result;
        try {
          pool = await getPool();
          connection = await pool.getConnection();
          previous_unit = (await connection.execute(`SELECT preferowana_jednostka FROM uzytkownicy WHERE login=:login`, [username], { outFormat: OUT_FORMAT_OBJECT })).rows;

          if (previous_unit) {
            if (previous_unit[0]) {
              if ((previous_unit[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA !== new_unit) {
                result = await connection.execute(`begin ZmienJednostke(:login); end;`, [username], {autoCommit: true}); 
              }
              res.render('account-settings', { username: req.session.username, unit: new_unit, unitCorrectlyChanged: ((previous_unit[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA !== new_unit) });
            }
          }
        } catch (err) {
          console.error(err);
          res.status(500);
        } finally {
          await connection?.close();
          await pool?.close();
        }
      } 
    }
  });

  app.post('/delete-account', checkLoggedIn, async (req: Request, res: Response) => {
    const typed_username = req.body.typed_username.toUpperCase();
    const username = req.session.username;
    if (typed_username !== username) {
      res.render('delete-account', { username: username, incorrectTypedUsername: true });
    } else {
      res.redirect('/logout');
      let pool, connection, result;
      try {
        pool = await getPool();
        connection = await pool.getConnection();
        
        // TODO: moze trzeba usunac wiecej niz tylko z tabeli 'uzytkownicy'
        result = (await connection.execute(`DELETE FROM uzytkownicy WHERE login=:login`, [username], { autoCommit: true }));
      } catch (err) {
        console.error(err);
        res.status(500);
      } finally {
        await connection?.close();
        await pool?.close();
      }
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
          res.json({
            error: 'Błąd wewnętrzny'
          })      
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
                    if(!result || !result[0] || (result[0] as {N: number}).N === 0){
                      error = true;
                      res.json({
                        error: 'Próbowano powiązać ćwiczenie z nieistniejącym sprzętem!'
                      })
                      break;
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
          res.json({
            error: 'Błąd wewnętrzny'
          })       
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

  app.post('/training-creator', checkLoggedIn, async (req: Request, res: Response) => {
    var exercises: string[] = [];
    Object.keys(req.body).forEach((key) => {
      if(key.startsWith("ex-")){
        exercises.push(decodeURI(key.substring(3)))
      }
    })
    if(req.body.name && req.body.privacy){
      if(['y', 'n'].includes(req.body.privacy)){
        let pool, connection, result;
        try{
          pool = await getPool();
          connection = await pool.getConnection();
          result = (await connection.execute(`SELECT COUNT(*) AS n FROM treningi WHERE nazwa=:nazwa`, [req.body.name], { outFormat: OUT_FORMAT_OBJECT } )).rows;
          if(result){
            if(result[0]){
              if((result[0] as {N: number}).N === 0){
                result = (await connection.execute(`SELECT COUNT(*) AS n FROM uzytkownicy WHERE login=:login`, [req.session.username], { outFormat: OUT_FORMAT_OBJECT } )).rows;
                if(result){
                  if(result[0]){
                    if((result[0] as {N: number}).N === 1){

                      var error = false;
                      var data = [
                        req.body.name,
                        boolToDB(req.body.privacy === 'y'),
                        req.session.username
                      ];
                      await connection.execute(`INSERT INTO treningi (nazwa, czy_prywatny, uzytkownicy_login) VALUES (:nazwa, :czy_prywatny, :uzytkownicy_login)`, data, {autoCommit: false});
                      for(const ex of exercises){
                        result = (await connection.execute(`SELECT COUNT(*) AS n FROM cwiczenia WHERE nazwa=:nazwa`, [ex], { outFormat: OUT_FORMAT_OBJECT } )).rows;
                        if(!result || !result[0] || (result[0] as {N: number}).N === 0){
                          error = true;
                          res.json({
                            error: 'Próbowano powiązać trening z nieistniejącym ćwiczeniem!'
                          })
                          break;
                        }
                        await connection.execute(`
                        INSERT INTO cwiczeniatreningi (cwiczenia_nazwa, treningi_nazwa) VALUES (:1, :2)`, [
                          ex, data[0]
                        ], {autoCommit: false});
                      }

                      if(!error){
                        await connection.commit();
                        res.json({
                          success: true,
                          data: {
                            name: data[0],
                            privacy: data[1]
                          }
                        });
                      }
                    }else{
                      res.json({
                        error: "Twoje konto nie istnieje!"
                      })
                    }
                  }else res.status(500)
                }else res.status(500)
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
          res.json({
            error: 'Błąd wewnętrzny'
          })       
        }finally{
          await connection?.close();
          await pool?.close();
        }
      }else{
        res.json({
          error: "Niepoprawna wartość pola \"Prywatność\"!"
        });
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!" + JSON.stringify(req.body)
      });
    }
  });

  app.post('/training-plan-creator/new-:training', checkLoggedIn, async (req: Request, res: Response) => {
    
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT czy_prywatny, uzytkownicy_login FROM treningi WHERE nazwa=:nazwa`, [req.params.training], { outFormat: OUT_FORMAT_OBJECT } )).rows;

      if(result){
        if(result.length === 0){
          res.render('error', {
            msg: 'Taki trening nie istnieje.'
          })
        }else{
          const data = result[0] as {
            CZY_PRYWATNY: string,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username && data.CZY_PRYWATNY === 'T'){
            res.render('error', {
              msg: 'Niestety ten trening nie należy do ciebie i jest prywatny.'
            })
          }else{
            var error = false;
            var end = null;
            if(req.body.end && req.body.end.length > 0){
              if(/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(req.body.end)){
                var dt = Date.parse(req.body.end);
                if(isNaN(dt)){
                  res.render('error', {
                    msg: 'Niepoprawna data zakończenia.'
                  })
                  error = true;
                }else{
                  end = new Date(dt);
                  if(end < (new Date())){
                    res.render('error', {
                      msg: 'Podano zbyt wczesną datę.'
                    })
                    error = true;
                  }
                }
              }else{
                res.render('error', {
                  msg: 'Niepoprawny format daty.'
                })
                error = true;
              }
            }
            if(!error){
              result = await connection.execute(`INSERT INTO plantreningowy (data_zakonczenia, uzytkownicy_login, treningi_nazwa) VALUES (:end, :login, :nazwa) RETURNING id INTO :id`, [end, req.session.username, req.params.training, { type: NUMBER, dir: BIND_OUT },
              ], {autoCommit: false})
              if(result){
                if(result.outBinds){
                  var id = (result.outBinds as number[][])[0][0];
                  if(req.body.days){
                    var keys: {
                      dow: string,
                      hour: number
                    }[] = [];
                    for(const day of req.body.days){
                      let hour = translateHourToNumber(day.hour);
                      let nhour = day.nhour ? translateHourToNumber(day.nhour) : undefined;
                      if(!daysOfWeek.includes(day.dow) || hour > 1440 || (day.ndow !== undefined && !daysOfWeek.includes(day.ndow)) || (nhour !== undefined && nhour > 1440)){
                        error = true;
                        res.render('error', {
                          msg: 'Niepoprawny dzień treningowy.'
                        })
                        break;

                      }
                      if(keys.every((val) => {
                        if(val.dow === day.dow && val.hour === hour){
                          return false;
                        }
                        return true;
                      })){
                        keys.push({
                          dow: day.dow,
                          hour: hour
                        })
                        await connection.execute(`INSERT INTO dnitreningowe (dzien_tygodnia, godzina, dzien_tyg_przypomnienia, godz_przypomnienia, plantreningowy_id) VALUES (:1, :2, :3, :4, :5)`, [
                          day.dow, hour, day.ndow, nhour, id
                        ], {autoCommit: false})
                      }else{
                        error = true;
                        res.render('error', {
                          msg: 'Zduplikowany dzień treningowy.'
                        })
                        break;
                      }
                      
                    }
                  }
                  if(!error){
                    await connection.commit();
                    res.redirect('/created/plan treningowy')
                  }
                }else res.status(500)
              }else res.status(500)
            }
          }
        }
          
      }else res.status(500)
    }catch(err){
      console.error(err);
      res.status(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
  });

  app.post('/training-plan-creator/modify-:id', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT data_zakonczenia, uzytkownicy_login FROM plantreningowy WHERE id=:id`, [req.params.id], { outFormat: OUT_FORMAT_OBJECT } )).rows;

      if(result){
        if(result.length === 0){
          res.render('error', {
            msg: 'Taki plan treningowy nie istnieje.\nMożliwe, że został usunięty niedawno w równoległej sesji.'
          })
        }else{
          const data = result[0] as {
            DATA_ZAKONCZENIA: Date|null,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username){
            res.render('error', {
              msg: 'Niestety ten plan treningowy nie należy do ciebie.\nDlatego nie możesz go modyfikować.'
            })
          }else{
            if(data.DATA_ZAKONCZENIA !== null && data.DATA_ZAKONCZENIA < (new Date())){
              res.render('error', {
                msg: 'Niestety ten plan treningowy jest już zakończony.\nDlatego nie możesz go modyfikować.\nProponujemy stworzyć nowy.'
              })
            }else{
              result = (await connection.execute(`DELETE FROM DNITRENINGOWE WHERE PLANTRENINGOWY_ID=:id`, [req.params.id], { autoCommit: false } )).rows;
              
              var error = false;
              var end = null;
              if(req.body.end && req.body.end.length > 0){
                if(/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(req.body.end)){
                  var dt = Date.parse(req.body.end);
                  if(isNaN(dt)){
                    res.render('error', {
                      msg: 'Niepoprawna data zakończenia.'
                    })
                    error = true;
                  }else{
                    end = new Date(dt);
                    if(end < (new Date())){
                      res.render('error', {
                        msg: 'Podano zbyt wczesną datę.'
                      })
                      error = true;
                    }
                  }
                }else{
                  res.render('error', {
                    msg: 'Niepoprawny format daty.'
                  })
                  error = true;
                }
              }
              if(!error){
                result = await connection.execute(`UPDATE plantreningowy SET data_zakonczenia=:end WHERE id=:id`, [end, req.params.id], {autoCommit: false})
                if(req.body.days){
                  var keys: {
                    dow: string,
                    hour: number
                  }[] = [];
                  for(const day of req.body.days){
                    let hour = translateHourToNumber(day.hour);
                    let nhour = day.nhour ? translateHourToNumber(day.nhour) : undefined;
                    if(!daysOfWeek.includes(day.dow) || hour > 1440 || (day.ndow !== undefined && !daysOfWeek.includes(day.ndow)) || (nhour !== undefined && nhour > 1440)){
                      error = true;
                      res.render('error', {
                        msg: 'Niepoprawny dzień treningowy.'
                      })
                      break;

                    }
                    if(keys.every((val) => {
                      if(val.dow === day.dow && val.hour === hour){
                        return false;
                      }
                      return true;
                    })){
                      keys.push({
                        dow: day.dow,
                        hour: hour
                      })
                      await connection.execute(`INSERT INTO dnitreningowe (dzien_tygodnia, godzina, dzien_tyg_przypomnienia, godz_przypomnienia, plantreningowy_id) VALUES (:1, :2, :3, :4, :5)`, [
                        day.dow, hour, day.ndow, nhour, req.params.id
                      ], {autoCommit: false})
                    }else{
                      error = true;
                      res.render('error', {
                        msg: 'Zduplikowany dzień treningowy.'
                      })
                      break;
                    }
                    
                  }
                }
                if(!error){
                  await connection.commit();
                  res.redirect('/modified/plan treningowy')
                }
              }
            }
          }
        }
          
      }else res.status(500)
    }catch(err){
      console.error(err);
      res.status(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
  });

  // listen
  const port = process.env.PORT;
  app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));
}

bootstrap();