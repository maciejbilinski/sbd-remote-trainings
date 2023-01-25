import express, { Express, Request, Response } from 'express';
import * as Eta from "eta"
import { getPool } from './db';
import { init } from './init';
import { copyFile } from 'fs';
import session from 'express-session';
import { BIND_OUT, NUMBER, OUT_FORMAT_ARRAY, OUT_FORMAT_OBJECT } from 'oracledb';
import fileUpload, { UploadedFile } from 'express-fileupload';
import path, { resolve } from 'path';
import { traceDeprecation } from 'process';
import { rejects } from 'assert';

const superhardquery = `
SELECT 
  json_object(
      'login' VALUE p.uzytkownicy_login, 
      'data_zakonczenia' VALUE p.data_zakonczenia,
      'cwiczenia' VALUE (
          SELECT 
              json_arrayagg(
                  json_object(
                      'nazwa' VALUE ct.cwiczenia_nazwa,
                      'ma_instruktaz' VALUE c.ma_instruktaz,
                      'czy_powtorzeniowe' VALUE c.czy_powtorzeniowe,
                      'sprzet' VALUE (
                          SELECT 
                              json_arrayagg(
                                  json_object(
                                      'nazwa' VALUE cs.sprzet_nazwa,
                                      'ma_zdjecie' VALUE s.ma_zdjecie,
                                      'czy_rozne_obciazenie' VALUE s.czy_rozne_obciazenie
                                  )
                              )
                          FROM
                              cwiczeniasprzet cs JOIN sprzet s ON cs.sprzet_nazwa=s.nazwa
                          WHERE
                              cs.cwiczenia_nazwa = c.nazwa
                      )
                  )    
              ) 
          FROM 
              cwiczeniatreningi ct JOIN cwiczenia c ON ct.cwiczenia_nazwa = c.nazwa
          WHERE
              ct.treningi_nazwa=p.treningi_nazwa)
  )
FROM 
  plantreningowy p
WHERE 
  p.id = :id
`;

const stillhardquery = `
SELECT
    NVL(json_objectagg(
          wc.cwiczenia_nazwa VALUE json_arrayagg(
              json_object(
                  'seria' VALUE wc.seria,
                  'wysilek' VALUE wc.wysilek,
                  'obciazenia' VALUE (
                      SELECT
                          json_arrayagg(
                              json_object(
                                  'obciazenie' VALUE o.obciazenie,
                                  'sprzet' VALUE o.sprzet_nazwa
                              )
                          )
                      FROM 
                          obciazenia o    
                      WHERE
                          o.wykonanecwiczenia_id IN wc.id
                  )
              )    
          )
      ), '{}'
    )
FROM
    wykonanecwiczenia wc
GROUP BY
    wc.wykonanetreningi_id, wc.cwiczenia_nazwa
HAVING
    wc.wykonanetreningi_id = (
        SELECT 
            wt.id 
        FROM 
            wykonanetreningi wt 
        WHERE 
                wt.plantreningowy_id = :1
            AND 
                wt.data_zakonczenia IS NOT NULL 
        ORDER BY 
            wt.data_zakonczenia DESC 
        FETCH FIRST 1 ROWS ONLY
)`;

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
const fullDaysOfWeek = {
  'PN': 'poniedziałek',
  'WT': 'wtorek',
  'SR': 'środę',
  'CZ': 'czwartek',
  'PT': 'piątek',
  'SB': 'sobotę',
  'ND': 'niedzielę',
}

const bootstrap = async () => {
  init();

  // express settings
  const app: Express = express();
  app.use(express.urlencoded({extended: true}));
  app.use(express.json());
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
  const checkLoggedIn = async (req: Request, res: Response, next: Function) => {
    if(process.env.STILL_LOGGED_IN == "true"){
      req.session.username = "MIKOLAJ"
      req.session.save();
    }
    if(!req.session.username) {
      res.redirect('/welcome');
    } else {
      let pool, connection, result, result2;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT COUNT(*) FROM uzytkownicy WHERE login=:1`, [req.session.username], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){  
        if(result[0]){
          result = result[0] as number[];
          if(result){
            if(result[0] === 1){
              result2 = (await connection.execute(`SELECT * FROM dnitreningowe WHERE dzien_tyg_przypomnienia IS NOT NULL AND godz_przypomnienia IS NOT NULL AND PLANTRENINGOWY_ID IN (SELECT id FROM plantreningowy WHERE uzytkownicy_login=:1)`, [
                req.session.username
              ], { outFormat: OUT_FORMAT_OBJECT })).rows;
              if(result2){
                (req as any).notification = {
                  daysOfWeek: result2.map((e: any) => {
                    return {
                      dw: daysOfWeek.indexOf(e.DZIEN_TYG_PRZYPOMNIENIA)+1,
                      hour: Math.floor(e.GODZ_PRZYPOMNIENIA/60),
                      minute: e.GODZ_PRZYPOMNIENIA%60,
                      trainingDay: (fullDaysOfWeek as any)[e.DZIEN_TYGODNIA],
                      trainingHour: translateNumberToHour(e.GODZINA)
                    }
                  })
                }
                next();
              }else res.sendStatus(500);

            }else{
              await new Promise((resolve) => {
                req.session.destroy(err => {
                  resolve(err);
                });
                res.redirect('/');
              })
            }
          }else res.sendStatus(500);
        }else res.sendStatus(500);
      }else res.sendStatus(500);
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
    }
  }

  // routes
  app.get('/', checkLoggedIn, async (req: Request, res: Response) => {
    const username = req.session.username;
    let pool, connection, result;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT TO_CHAR(wt.data_zakonczenia, 'DAY') as DZIEN, COUNT(*) as N FROM wykonanetreningi wt JOIN plantreningowy pt ON wt.plantreningowy_id = pt.id WHERE wt.data_zakonczenia BETWEEN TRUNC(SYSDATE, 'IW') AND SYSDATE AND pt.uzytkownicy_login=:login GROUP BY TO_CHAR(wt.data_zakonczenia, 'DAY')`, [username], { outFormat: OUT_FORMAT_OBJECT })).rows;
      if (result) {
        res.render("cockpit", { username: username, results: result, notification: (req as any).notification });
      } else res.sendStatus(500);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
      res.send('Błąd wewnętrzny')
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/welcome', (req: Request, res: Response) => {
    res.render("welcome", {});
  });

  app.get('/created/:what', checkLoggedIn, (req: Request, res: Response) => {
    res.render('info', {
      info: 'Dodano',
      what: req.params.what, notification: (req as any).notification
    })
  });

  app.get('/modified/:what', checkLoggedIn, (req: Request, res: Response) => {
    res.render('info', {
      info: 'Zmieniono',
      what: req.params.what, notification: (req as any).notification
    })
  });

  app.get('/done/:what', checkLoggedIn, (req: Request, res: Response) => {
    res.render('info', {
      info: 'Ukończono',
      what: req.params.what, notification: (req as any).notification
    })
  });

  app.get('/training-creator', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT nazwa FROM cwiczenia`, [], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){
          
          let result2 = (await connection.execute(`SELECT nazwa, ma_zdjecie FROM sprzet ORDER BY UPPER(nazwa)`, [], { outFormat: OUT_FORMAT_ARRAY } )).rows;
          if(result2){
            res.render("training_creator", {
              exercises: result.flat(),
              equipment: result2, notification: (req as any).notification
            });
            }else res.sendStatus(500)
        }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
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
      result = (await connection.execute(`SELECT nazwa, ma_zdjecie FROM sprzet ORDER BY UPPER(nazwa)`, [], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){
          res.render("exercises_creator", {
            equipment: result, notification: (req as any).notification
          });
        }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }

    
  });

  app.get('/equipment-creator', checkLoggedIn, (req: Request, res: Response) => {
    res.render("equipment_creator", {notification: (req as any).notification});
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
            msg: 'Taki trening nie istnieje.', notification: (req as any).notification
          })
        }else{
          const data = result[0] as {
            CZY_PRYWATNY: string,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username && data.CZY_PRYWATNY === 'T'){
            res.render('error', {
              msg: 'Niestety ten trening nie należy do ciebie i jest prywatny.', notification: (req as any).notification
            })
          }else{
            res.render('training_plan_creator', {notification: (req as any).notification})
          }
        }
          
      }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
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
            msg: 'Taki plan treningowy nie istnieje.\nMożliwe, że został usunięty niedawno w równoległej sesji.', notification: (req as any).notification
          })
        }else{
          const data = result[0] as {
            DATA_ZAKONCZENIA: Date|null,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username){
            res.render('error', {
              msg: 'Niestety ten plan treningowy nie należy do ciebie.\nDlatego nie możesz go modyfikować.', notification: (req as any).notification
            })
          }else{
            if(data.DATA_ZAKONCZENIA !== null && data.DATA_ZAKONCZENIA < (new Date())){
              res.render('error', {
                msg: 'Niestety ten plan treningowy jest już zakończony.\nDlatego nie możesz go modyfikować.\nProponujemy stworzyć nowy.', notification: (req as any).notification
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
                    element.GODZINA
                  ]).sort((a, b) => {
                    const diff = daysOfWeek.indexOf(a[0] as string) - daysOfWeek.indexOf(b[0] as string);
                    if(diff === 0){
                      return (a[5] as number)-(b[5] as number);
                    }else return diff;
                  }),
                  end: data.DATA_ZAKONCZENIA === null ? undefined : formatDate(data.DATA_ZAKONCZENIA), notification: (req as any).notification
                })
              }else res.sendStatus(500)
            }
          }
        }
          
      }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
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
        res.render('training-search', { username: req.session.username, table: result, notification: (req as any).notification });
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/training-panel', checkLoggedIn, async (req: Request, res: Response) => {
    const trainingName = req.query.name;
    const trainingAuthor = req.query.author;
    const username = req.session.username;
    let pool, connection, result, result2;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT COUNT(*) AS n FROM treningi WHERE nazwa=:nazwa AND uzytkownicy_login=:login AND (czy_prywatny='N' OR uzytkownicy_login=:userlogin)`, [trainingName, trainingAuthor, username], { outFormat: OUT_FORMAT_OBJECT })).rows;
      if (result) {
        if (result[0]) {
          if ((result[0] as { N: number }).N === 1) {
            result2 = (await connection.execute(`SELECT skutecznosc, trudnosc, intensywnosc FROM ocenytreningow WHERE treningi_nazwa=:nazwa AND uzytkownicy_login=:login AND (SELECT COUNT(*) FROM ocenytreningow WHERE treningi_nazwa=:nazwa AND uzytkownicy_login=:login) = 1`, [trainingName, username], { outFormat: OUT_FORMAT_ARRAY })).rows;
            if (result2) {
              if (result2[0]) {
                const skutecznosc = result2[0][0 as keyof typeof result2[0]];
                const trudnosc = result2[0][1 as keyof typeof result2[0]];
                const intensywnosc = result2[0][2 as keyof typeof result2[0]];
                res.render('training-panel', { username: username, notification: (req as any).notification, trainingName: trainingName, trainingAuthor: trainingAuthor, skutecznosc: skutecznosc, trudnosc: trudnosc, intensywnosc: intensywnosc, wasGraded: true });
              } else {
                res.render('training-panel', { username: username, notification: (req as any).notification, trainingName: trainingName, trainingAuthor: trainingAuthor });
              }
            }
          } else {
            res.redirect('/');
          }
        }
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });


  app.get('/exercise-search', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT * FROM cwiczenia`, [], { outFormat: OUT_FORMAT_ARRAY })).rows;
      if (result) {
        res.render('exercise-search', { table: result, notification: (req as any).notification });
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/exercise-panel', checkLoggedIn, async (req: Request, res: Response) => {
    const exerciseName = req.query.name;
    const username = req.session.username;
    let pool, connection, result, result2
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT ma_instruktaz FROM cwiczenia WHERE nazwa=:nazwa`, [exerciseName], { outFormat: OUT_FORMAT_OBJECT })).rows;
      if (result) {
        if (result.length > 0) {
          result = result[0] as any;
          result2 = (await connection.execute(`SELECT cena_sprzetu, trudnosc, intensywnosc FROM ocenycwiczen WHERE cwiczenia_nazwa=:nazwa AND uzytkownicy_login=:login AND (SELECT COUNT(*) FROM ocenycwiczen WHERE cwiczenia_nazwa=:nazwa AND uzytkownicy_login=:login) = 1`, [exerciseName, username], { outFormat: OUT_FORMAT_ARRAY })).rows;
          if (result2) {
            if (result2[0]) {
              const cenaSprzetu = result2[0][0 as keyof typeof result2[0]];
              const trudnosc = result2[0][1 as keyof typeof result2[0]];
              const intensywnosc = result2[0][2 as keyof typeof result2[0]];
              res.render('exercise-panel', { exerciseVideo: result.MA_INSTRUKTAZ, username: username, notification: (req as any).notification, exerciseName: exerciseName, cenaSprzetu: cenaSprzetu, trudnosc: trudnosc, intensywnosc: intensywnosc, wasGraded: true });
            } else {
              res.render('exercise-panel', { exerciseVideo: result.MA_INSTRUKTAZ, username: username, notification: (req as any).notification, exerciseName: exerciseName});
            }
          }
        }else res.render('error', {
          msg: 'Nie ma takiego ćwiczenia w bazie danych',
          notification: (req as any).notification,

        })
      }else res.sendStatus(500);
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/user-trainings', checkLoggedIn, async (req: Request, res: Response) => {
    const username = req.session.username;
    let pool, connection, result, result2;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT nazwa FROM treningi WHERE czy_prywatny = 'N' AND uzytkownicy_login=:login`, [username], { outFormat: OUT_FORMAT_ARRAY })).rows;
      result2 = (await connection.execute(`SELECT nazwa FROM treningi WHERE czy_prywatny = 'T' AND uzytkownicy_login=:login`, [username], { outFormat: OUT_FORMAT_ARRAY })).rows;
      if (result && result2) {
        res.render('user-trainings', { username: username, notification: (req as any).notification, tablePublic: result, tablePrivate: result2 });
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/delete-training', checkLoggedIn, async (req: Request, res: Response) => {
    const username = req.session.username;
    const trainingName = req.query.name;
    let pool, connection, result;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT COUNT(*) AS n FROM treningi WHERE nazwa=:nazwa AND uzytkownicy_login=:login AND czy_prywatny='T'`, [trainingName, username], { outFormat: OUT_FORMAT_OBJECT })).rows;
      if (result) {
        if (result[0]) {
          if ((result[0] as { N: number }).N === 1) {
            res.render('delete-training', {username: username, trainingName: trainingName, notification: (req as any).notification });
          } else {
            res.redirect('/');
          }
        }
      } 
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/user-training-plans', checkLoggedIn, async (req: Request, res: Response) => {
    const username = req.session.username;
    let pool, connection, result, result2;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT id, treningi_nazwa, TO_CHAR(data_rozpoczecia, 'DD-MM-YYYY'), TO_CHAR(data_zakonczenia, 'DD-MM-YYYY') FROM plantreningowy WHERE uzytkownicy_login=:login AND (data_zakonczenia IS NULL OR SYSDATE < data_zakonczenia)`, [username], { outFormat: OUT_FORMAT_ARRAY })).rows;
      result2 = (await connection.execute(`SELECT id, treningi_nazwa, TO_CHAR(data_rozpoczecia, 'DD-MM-YYYY'), TO_CHAR(data_zakonczenia, 'DD-MM-YYYY') FROM plantreningowy WHERE uzytkownicy_login=:login AND (data_zakonczenia IS NOT NULL AND SYSDATE > data_zakonczenia)`, [username], { outFormat: OUT_FORMAT_ARRAY })).rows;
      if (result && result2) {
        res.render('user-training-plans', { username: username, currentPlans: result, finishedPlans: result2, notification: (req as any).notification });
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/equipment-search', checkLoggedIn, async (req: Request, res: Response) => {
    let pool, connection, result;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT * FROM sprzet`, [], { outFormat: OUT_FORMAT_ARRAY })).rows;
      if (result) {
        res.render('equipment-search', { table: result, notification: (req as any).notification });
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.get('/equipment-panel', checkLoggedIn, async (req: Request, res: Response) => {
    const equipmentName = req.query.name;
    let pool, connection, result, result2;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(`SELECT COUNT(*) AS n FROM sprzet WHERE nazwa=:nazwa`, [equipmentName], { outFormat: OUT_FORMAT_OBJECT })).rows;
      if (result) {
        if (result[0]) {
          if ((result[0] as { N: number }).N === 1) {
            result2 = (await connection.execute(`SELECT ma_zdjecie, czy_rozne_obciazenie FROM sprzet WHERE nazwa=:nazwa`, [equipmentName], { outFormat: OUT_FORMAT_ARRAY})).rows;
            if (result2) {
              if (result2[0]) {
                const hasImage = result2[0][0 as keyof typeof result2[0]];
                const hasDifferentWeight = result2[0][1 as keyof typeof result2[0]];
                res.render('equipment-panel', { equipmentName: equipmentName, notification: (req as any).notification, hasImage: hasImage, hasDifferentWeight: hasDifferentWeight });
              }
            }
          } else {
            res.redirect('/');
          }
        }
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
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
            res.render('account-settings', { username: req.session.username, notification: (req as any).notification, unit: (result[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA});
          }
        }
      } catch (err) {
        console.error(err);
        res.sendStatus(500);          
        res.send('Błąd wewnętrzny')       
      } finally {
        await connection?.close();
        await pool?.close();
      }
  });

  app.get('/delete-account', checkLoggedIn, (req: Request, res: Response) => {
    res.render('delete-account', {username: req.session.username, notification: (req as any).notification});
  });

  app.get('/training-mode/:id', checkLoggedIn, async (req: Request, res: Response) => {
    res.set('Cache-control', 'no-cache, max-age=0, must-revalidate, no-store')
    let pool, connection, result, result2, result3;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(superhardquery, [req.params.id], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){
          if(result[0]){
            // '{"login":"admin","data_zakonczenia":"2050-06-06T20:49:30","cwiczenia":null}'
            result = (result as string[][])[0]
            if(result[0]){
              result = JSON.parse(result[0]);
              if(result.login !== req.session.username){
                res.render('error', {
                  msg: 'Ten plan treningowy nie należy do ciebie!', notification: (req as any).notification
                })
              }else{
                var end;
                var ok = false;
                if(result.data_zakonczenia === null){
                  ok = true;
                }else{
                  end = new Date(result.data_zakonczenia);
                  if(end >= new Date()){
                    ok = true;
                  }
                }

                if(ok){
                  result2 = (await connection.execute('SELECT preferowana_jednostka FROM uzytkownicy WHERE login=:1', [
                    req.session.username
                  ],{ outFormat: OUT_FORMAT_OBJECT })).rows;
                  if (result2) {
                    if (result2[0]) {
                      result3 = (await connection.execute(stillhardquery, [
                        req.params.id
                      ], { outFormat: OUT_FORMAT_ARRAY })).rows;
                      if(result3){
                        if(result3[0]){
                          result3 = (result3 as string[][])[0]
                          if(result3[0]){
                            result3 = JSON.parse(result3[0]);
                            res.render("training_mode", {
                              exercises: result.cwiczenia, notification: (req as any).notification,
                              unit: (result2[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA,
                              prev: result3
                            });
                          }else res.sendStatus(500);
                        }else res.sendStatus(500);
                      }else res.sendStatus(500);
                    }else res.sendStatus(500);
                  }else res.sendStatus(500)
                  
                }else{
                  res.render("error", {
                    msg: "Ten plan treningowy jest już zakończony", notification: (req as any).notification
                  })
                }
              }
            }else res.sendStatus(500)
          }else res.sendStatus(500)
        }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
  })

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
                res.redirect('/')
              }else res.sendStatus(500)
            }else res.sendStatus(500)
          }catch(err){
            console.error(err);
            res.sendStatus(500);   
            res.send('Błąd wewnętrzny')       
          }finally{
            await connection?.close();
            await pool?.close();
          }
        }else{
          res.render("welcome", {
            error: "Niepoprawny format nazwy użytkownika!",
            username: username, notification: (req as any).notification
          });
        }
      }else{
        res.sendStatus(400);
      }
    }else{
      res.sendStatus(404);
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
              res.render('account-settings', { username: req.session.username, notification: (req as any).notification, unit: new_unit, unitCorrectlyChanged: ((previous_unit[0] as { PREFEROWANA_JEDNOSTKA: string }).PREFEROWANA_JEDNOSTKA !== new_unit) });
            }
          }
        } catch (err) {
          console.error(err);
          res.sendStatus(500);
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
      res.render('delete-account', { username: username, notification: (req as any).notification, incorrectTypedUsername: true });
    } else {
      res.redirect('/logout');
      let pool, connection, result;
      try {
        pool = await getPool();
        connection = await pool.getConnection();
        await connection.execute(`DELETE FROM ocenycwiczen WHERE uzytkownicy_login=:login`, [username], { autoCommit: false });
        await connection.execute(`DELETE FROM ocenytreningow WHERE uzytkownicy_login=:login`, [username], { autoCommit: false });
        await connection.execute(`DELETE FROM wykonanecwiczenia WHERE wykonanetreningi_id IN (SELECT id FROM wykonanetreningi WHERE plantreningowy_id IN (SELECT id FROM plantreningowy WHERE uzytkownicy_login=:login AND treningi_nazwa IN (SELECT nazwa FROM treningi WHERE uzytkownicy_login=:login AND czy_prywatny = 'T')))`, [username], { autoCommit: false });
        await connection.execute(`DELETE FROM wykonanetreningi WHERE plantreningowy_id IN (SELECT id FROM plantreningowy WHERE uzytkownicy_login=:login AND treningi_nazwa IN (SELECT nazwa FROM treningi WHERE uzytkownicy_login=:login AND czy_prywatny = 'T'))`, [username], { autoCommit: false });
        await connection.execute(`DELETE FROM plantreningowy WHERE uzytkownicy_login=:login`, [username], { autoCommit: false });
        await connection.execute(`DELETE FROM cwiczeniatreningi WHERE treningi_nazwa IN (SELECT nazwa FROM treningi WHERE uzytkownicy_login=:login AND czy_prywatny = 'T')`, [username], { autoCommit: false });
        await connection.execute(`DELETE FROM treningi WHERE uzytkownicy_login=:login AND czy_prywatny = 'T'`, [username], { autoCommit: false });
        // bind all public trainings to a special public account '*publiczny*'
        result = (await connection.execute(`SELECT COUNT(*) AS n FROM uzytkownicy WHERE login='*publiczny*'`, {}, { outFormat: OUT_FORMAT_OBJECT })).rows;
        if (result) {
          if (result[0]) {
            if ((result[0] as { N: number }).N === 0) {
              await connection.execute(`INSERT INTO uzytkownicy (login, preferowana_jednostka) VALUES ('*publiczny*', 'K')`, {}, { autoCommit: false });
            }
            await connection.execute(`UPDATE treningi SET uzytkownicy_login='*publiczny*' WHERE uzytkownicy_login=:login AND czy_prywatny = 'N'`, [username], { autoCommit: false });
          }
        }
        await connection.execute(`DELETE FROM uzytkownicy WHERE login=:login`, [username], { autoCommit: false });
        await connection.commit();
      } catch (err) {
        console.error(err);
        res.sendStatus(500);
      } finally {
        await connection?.close();
        await pool?.close();
      }
    }
  });

  app.post('/delete-training', checkLoggedIn, async (req: Request, res: Response) => {
    const username = req.session.username;
    const typedTrainingName = req.body.typed_training_name;
    const actualTrainingName = req.body.actual_training_name;
    if (typedTrainingName !== actualTrainingName) {
      res.render('delete-training', { username: username, notification: (req as any).notification, trainingName: actualTrainingName, incorrectTypedTrainingName: true });
    } else {
      let pool, connection;
      try {
        pool = await getPool();
        connection = await pool.getConnection();
        await connection.execute(`DELETE FROM ocenytreningow WHERE uzytkownicy_login=:login AND treningi_nazwa=:nazwa`, [username, actualTrainingName], {autoCommit: false});
        await connection.execute(`DELETE FROM plantreningowy WHERE uzytkownicy_login=:login AND treningi_nazwa=:nazwa`, [username, actualTrainingName], { autoCommit: false });
        await connection.execute(`DELETE FROM cwiczeniatreningi WHERE treningi_nazwa=:nazwa`, [actualTrainingName], { autoCommit: false });
        await connection.execute(`DELETE FROM treningi WHERE nazwa=:nazwa AND uzytkownicy_login=:login`, [actualTrainingName, username], { autoCommit: false });
        await connection.commit();
        res.redirect('/user-trainings');
      } catch (err) {
        console.error(err);
        res.sendStatus(500);
      } finally {
        await connection?.close();
        await pool?.close();
      }
    }
  });

  app.post('/equipment-creator', checkLoggedIn, fileUpload({limits:{fileSize: 100000000}}), async (req: Request, res: Response) => {
    if(req.body.name && req.body.type){
      if(req.body.name.length <= 255){
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
                    if(!['png'].includes(ext)){
                      res.json({
                        error: "Niepoprawny format zdjęcia! Dozwolone to: 'png'."
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
              }else res.sendStatus(500)
            }else res.sendStatus(500)
          }catch(err){
            console.error(err);
            res.sendStatus(500);     
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
          error: "Za długa nazwa!"
        });
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!"
      });
    }
  });

  app.post('/exercise-creator', checkLoggedIn, fileUpload({limits:{fileSize: 100000000}}), async (req: Request, res: Response) => {
    var equipment: string[] = [];
    Object.keys(req.body).forEach((key) => {
      if(key.startsWith("equipment-")){
        equipment.push(decodeURI(key.substring(10)))
      }
    })
    if(req.body.name && req.body.type){
      if(req.body.name.length <= 255){

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
              }else res.sendStatus(500)
            }else res.sendStatus(500)
          }catch(err){
            console.error(err);
            res.sendStatus(500);   
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
          error: "Za długa nazwa!"
        });
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!"
      });
    }
  });

  app.post('/add-video', checkLoggedIn, fileUpload({limits:{fileSize: 100000000}}), async (req: Request, res: Response) => {
    if(req.body.name && req.files?.video){
      let pool, connection, result;
      try{
        const video = (req.files.video as UploadedFile);
        const ext = getExtension(video.name);
        if(!['mp4'].includes(ext)){
          res.json({
            error: "Niepoprawny format instruktażu! Dozwolone to: 'mp4'."
          });
        }else{
          video.mv(path.join(__dirname, '..', 'files', 'exercises', req.body.name+"."+ext))
          pool = await getPool();
          connection = await pool.getConnection();
          result = await connection.execute(`UPDATE cwiczenia SET ma_instruktaz='T' WHERE nazwa=:nazwa`, [req.body.name], {autoCommit: true});
          return res.json({
            success: true
          })
        }
      }catch(err){
        console.error(err);
        res.sendStatus(500);   
        res.json({
          error: 'Błąd wewnętrzny'
        })       
      }finally{
        await connection?.close();
        await pool?.close();
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!"
      });
    }
  });

  app.post('/add-photo', checkLoggedIn, fileUpload({limits:{fileSize: 100000000}}), async (req: Request, res: Response) => {
    if(req.body.name && req.files?.photo){
      let pool, connection, result;
      try{
        const photo = (req.files.photo as UploadedFile);
        const ext = getExtension(photo.name);
        if(!['png'].includes(ext)){
          res.json({
            error: "Niepoprawny format zdjęcia! Dozwolone to: 'png'."
          });
        }else{
          photo.mv(path.join(__dirname, '..', 'files', 'equipment', req.body.name+"."+ext))
          pool = await getPool();
          connection = await pool.getConnection();
          result = await connection.execute(`UPDATE sprzet SET ma_zdjecie='T' WHERE nazwa=:nazwa`, [req.body.name], {autoCommit: true});
          return res.json({
            success: true
          })
        }
      }catch(err){
        console.error(err);
        res.sendStatus(500);   
        res.json({
          error: 'Błąd wewnętrzny'
        })       
      }finally{
        await connection?.close();
        await pool?.close();
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
      if(req.body.name.length <= 255){
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
                    }else res.sendStatus(500)
                  }else res.sendStatus(500)
                }else{
                  res.json({
                    error: "Ta nazwa jest już zajęta!"
                  });
                }
              }else res.sendStatus(500)
            }else res.sendStatus(500)
          }catch(err){
            console.error(err);
            res.sendStatus(500);   
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
          error: "Za długa nazwa!"
        });
      }
    }else{
      res.json({
        error: "Nie wypełniono obowiązkowych pól!"
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
            msg: 'Taki trening nie istnieje.', notification: (req as any).notification
          })
        }else{
          const data = result[0] as {
            CZY_PRYWATNY: string,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username && data.CZY_PRYWATNY === 'T'){
            res.render('error', {
              msg: 'Niestety ten trening nie należy do ciebie i jest prywatny.', notification: (req as any).notification
            })
          }else{
            var error = false;
            var end = null;
            if(req.body.end && req.body.end.length > 0){
              if(/[0-9]{4}-[0-9]{2}-[0-9]{2}/.test(req.body.end)){
                var dt = Date.parse(req.body.end);
                if(isNaN(dt)){
                  res.render('error', {
                    msg: 'Niepoprawna data zakończenia.', notification: (req as any).notification
                  })
                  error = true;
                }else{
                  end = new Date(dt);
                  if(end < (new Date())){
                    res.render('error', {
                      msg: 'Podano zbyt wczesną datę.', notification: (req as any).notification
                    })
                    error = true;
                  }
                }
              }else{
                res.render('error', {
                  msg: 'Niepoprawny format daty.', notification: (req as any).notification
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
                          msg: 'Niepoprawny dzień treningowy.', notification: (req as any).notification
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
                          msg: 'Zduplikowany dzień treningowy.', notification: (req as any).notification
                        })
                        break;
                      }
                      
                    }
                  }
                  if(!error){
                    await connection.commit();
                    res.redirect('/created/plan treningowy')
                  }
                }else res.sendStatus(500)
              }else res.sendStatus(500)
            }
          }
        }
          
      }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
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
            msg: 'Taki plan treningowy nie istnieje.\nMożliwe, że został usunięty niedawno w równoległej sesji.', notification: (req as any).notification
          })
        }else{
          const data = result[0] as {
            DATA_ZAKONCZENIA: Date|null,
            UZYTKOWNICY_LOGIN: string
          };
          if(data.UZYTKOWNICY_LOGIN !== req.session.username){
            res.render('error', {
              msg: 'Niestety ten plan treningowy nie należy do ciebie.\nDlatego nie możesz go modyfikować.', notification: (req as any).notification
            })
          }else{
            if(data.DATA_ZAKONCZENIA !== null && data.DATA_ZAKONCZENIA < (new Date())){
              res.render('error', {
                msg: 'Niestety ten plan treningowy jest już zakończony.\nDlatego nie możesz go modyfikować.\nProponujemy stworzyć nowy.', notification: (req as any).notification
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
                      msg: 'Niepoprawna data zakończenia.', notification: (req as any).notification
                    })
                    error = true;
                  }else{
                    end = new Date(dt);
                    if(end < (new Date())){
                      res.render('error', {
                        msg: 'Podano zbyt wczesną datę.', notification: (req as any).notification
                      })
                      error = true;
                    }
                  }
                }else{
                  res.render('error', {
                    msg: 'Niepoprawny format daty.', notification: (req as any).notification
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
                        msg: 'Niepoprawny dzień treningowy.', notification: (req as any).notification
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
                        msg: 'Zduplikowany dzień treningowy.', notification: (req as any).notification
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
          
      }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
      res.send('Błąd wewnętrzny')       
    }finally{
      await connection?.close();
      await pool?.close();
    }
  });

  app.post('/training-panel', checkLoggedIn, async (req: Request, res: Response) => {
    const trainingName = req.body.trainingName;
    const trainingAuthor = req.body.trainingAuthor;
    const username = req.session.username;
    const skutecznosc = req.body.skutecznosc;
    const trudnosc = req.body.trudnosc;
    const intensywnosc = req.body.intensywnosc;
    let pool, connection;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      await connection.execute(`INSERT INTO ocenytreningow VALUES (:skutecznosc, :trudnosc, :intensywnosc, :login, :nazwa)`, [skutecznosc, trudnosc, intensywnosc, username, trainingName], {autoCommit: true});
      res.render('training-panel', {username: username, notification: (req as any).notification, trainingName: trainingName, trainingAuthor: trainingAuthor, gradeSuccess: true, skutecznosc: skutecznosc, trudnosc: trudnosc, intensywnosc: intensywnosc, wasGraded: true});
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.post('/exercise-panel', checkLoggedIn, async (req: Request, res: Response) => {
    const exerciseName = req.body.exerciseName;
    const username = req.session.username;
    const cenaSprzetu = req.body.cenaSprzetu;
    const trudnosc = req.body.trudnosc;
    const intensywnosc = req.body.intensywnosc;
    let pool, connection;
    try {
      pool = await getPool();
      connection = await pool.getConnection();
      await connection.execute(`INSERT INTO ocenycwiczen VALUES (:cenaSprzetu, :trudnosc, :intensywnosc, :login, :nazwa)`, [cenaSprzetu, trudnosc, intensywnosc, username, exerciseName], { autoCommit: true });
      res.render('exercise-panel', { username: username, notification: (req as any).notification, exerciseName: exerciseName, gradeSuccess: true, cenaSprzetu: cenaSprzetu, trudnosc: trudnosc, intensywnosc: intensywnosc, wasGraded: true });
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    } finally {
      await connection?.close();
      await pool?.close();
    }
  });

  app.post('/training-mode/:id', checkLoggedIn, async (req: Request, res: Response) => {
   if(req.body.rating && req.body.startDate){
      const rating = parseInt(req.body.rating);
      const startDate = parseInt(req.body.startDate);
      if(isNaN(rating) || isNaN(startDate) || rating < 1 || rating > 5){
        return res.json({
          error: 'Niepoprawna wartość głosowania lub daty rozpoczęcia'
        })
      }
     var exercises: any = {};
     for(const key of Object.keys(req.body)){
      if(key.startsWith('exercises')){
        let parts = key.split('+');
        if(parts.length > 1){
          const exName = decodeURI(parts[1]);
          if(!Object.keys(exercises).includes(exName)){
            exercises[exName] = {};
          }
          if(parts.length > 2){
            var seriesN: number|string;
            var ok = true;
            try{
              seriesN = parseInt(parts[2]);
              if(isNaN(seriesN)) ok = false;
            }catch(err: any){
              ok = false;
            }
            if(ok){
              seriesN = seriesN!.toString();
              if(!Object.keys(exercises[exName]).includes(seriesN)){
                exercises[exName][seriesN] = {};
              }
  
              if(parts.length > 3){
                if(['amount', 'time', 'weight'].includes(parts[3])){
                  if(parts[3] === 'weight'){
                    if(!Object.keys(exercises[exName][seriesN]).includes('weight')){
                      exercises[exName][seriesN]['weight'] = {};
                    }
                    
                    if(parts.length === 5){
                      var eq = decodeURI(parts[4]);
                      if(!Object.keys(exercises[exName][seriesN]['weight']).includes(eq)){
                        var value: number;
                        var ok: boolean = true;
                        try{
                          value = parseInt(req.body[key]);
                          if(isNaN(value)) ok = false;
                        }catch(err: any){
                          ok = false;
                        }
                        if(ok){
                          exercises[exName][seriesN]['weight'][eq] = value!;
                          continue;
                        }
                      }
                    }
                  }else if(parts.length === 4){
                    if(!Object.keys(exercises[exName][seriesN]).includes('amount') && !Object.keys(exercises[exName][seriesN]).includes('time')){
                      var value: number;
                      var ok: boolean = true;
                      try{
                        value = parseInt(req.body[key]);
                        if(isNaN(value)) ok = false;
                      }catch(err: any){
                        ok = false;
                      }
                      if(ok){
                        exercises[exName][seriesN][parts[3]] = value!;
                        continue;
                      }
                    }
                  }
                }
              }
            }
          }
        }
        return res.json({
          error: "Niepoprawny parametr exercises"
        });
        break;
      }
     }
  
     for(const key in exercises){
      var series = Object.keys(exercises[key]).map((e) => parseInt(e));
      series.sort();
      var prev = 0;
      for(let i=0; i<series.length; i++){
        if((series[i]-prev) !== 1){
          return res.json({
            error: "Niepoprawny parametr exercises"
          });
          break;
        }
        prev = series[i];
      }
     }

    let pool, connection, result, result2;
    try{
      pool = await getPool();
      connection = await pool.getConnection();
      result = (await connection.execute(superhardquery, [req.params.id], { outFormat: OUT_FORMAT_ARRAY } )).rows;
      if(result){
          if(result[0]){
            result = (result as string[][])[0]
            if(result[0]){
              result = JSON.parse(result[0]);
              if(result.login !== req.session.username){
                res.json({'error': 'Ten plan treningowy nie należy do ciebie!'})
              }else{
                var end;
                var ok = false;
                if(result.data_zakonczenia === null){
                  ok = true;
                }else{
                  end = new Date(result.data_zakonczenia);
                  if(end >= new Date()){
                    ok = true;
                  }
                }
                
                if(ok){
                  result2 = await connection.execute('INSERT INTO wykonanetreningi (data_rozpoczecia, data_zakonczenia, ocena_zmeczenia, plantreningowy_id) VALUES (:1, :2, :3, :4) RETURNING id INTO :id', [
                    new Date(startDate), new Date(), rating, req.params.id, { type: NUMBER, dir: BIND_OUT }
                  ], {autoCommit: false});
                  var id = (result2.outBinds as number[][])[0][0];
                  loop1:
                  for(const exNameKey in exercises){
                    loop2:
                    for(const seriesKey in exercises[exNameKey]){
                      var error = true;
                      loop3:
                      for(const realExercise of result.cwiczenia){
                        if(realExercise.nazwa === exNameKey){
                          if(
                            (Object.keys(exercises[exNameKey][seriesKey]).includes('amount') && realExercise.czy_powtorzeniowe === 'T') ||
                            (Object.keys(exercises[exNameKey][seriesKey]).includes('time') && realExercise.czy_powtorzeniowe === 'N')
                          ){
                            result2 = await connection.execute('INSERT INTO wykonanecwiczenia (seria, wysilek, cwiczenia_nazwa, wykonanetreningi_id) VALUES (:1, :2, :3, :4) RETURNING id INTO :id', [
                              parseInt(seriesKey), parseInt(exercises[exNameKey][seriesKey]['amount'] ? exercises[exNameKey][seriesKey]['amount'] : exercises[exNameKey][seriesKey]['time']), exNameKey, id, { type: NUMBER, dir: BIND_OUT }
                            ], {autoCommit: false});
                            error = false;
                            var wcId = (result2.outBinds as number[][])[0][0];;
                            if(Object.keys(exercises[exNameKey][seriesKey]).includes('weight')){
                              loop4:
                              for(const eqName in exercises[exNameKey][seriesKey]['weight']){
                                var error2 = true;
                                if(realExercise.sprzet){
                                  loop5:
                                  for(const realEq of realExercise.sprzet){
                                    if(realEq.nazwa === eqName){
                                      if(realEq.czy_rozne_obciazenie === 'T'){
                                        await connection.execute('INSERT INTO obciazenia (obciazenie, wykonanecwiczenia_id, sprzet_nazwa) VALUES (:1, :2, :3)', [
                                          parseInt(exercises[exNameKey][seriesKey]['weight'][eqName]), wcId, eqName
                                        ], {autoCommit: false})
                                        error2 = false;
                                      }
                                      break loop5;
                                    }
                                  }
                                }
                                if(error2){
                                  res.json({
                                    error: 'Próbowano dodać błędne obciążenie sprzętu!'
                                  })
                                  break loop1;
                                }
                              }
                            }
                            break loop3;
                          }
                        }
                      }
                      if(error){
                        res.json({
                          error: 'Próbowano wykonać błędne ćwiczenie!'
                        })
                        break loop1;
                      }
                      
                    }
                  }
                  await connection.commit();
                  res.json({success: true})
                }else{
                  res.json({'error': 'Ten plan treningowy jest już zakończony'})
                }
              }
            }else res.sendStatus(500)
          }else res.sendStatus(500)
        }else res.sendStatus(500)
    }catch(err){
      console.error(err);
      res.sendStatus(500);  
      res.send('Błąd wewnętrzny')       
        
    }finally{
      await connection?.close();
      await pool?.close();
    }
   }else{
    return res.json({
      error: "Brak parametru głosowania lub daty rozpoczęcia"
    })
   }
  });

  // listen
  const port = process.env.PORT;
  app.listen(port, () => console.log(`Server is running at http://localhost:${port}`));
}

bootstrap();