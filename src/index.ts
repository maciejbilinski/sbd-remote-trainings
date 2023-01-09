import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import "reflect-metadata";
import * as oracledb from 'oracledb';

dotenv.config();

const app: Express = express();
const port = process.env.PORT;

import { DataSource } from "typeorm"

const AppDataSource = new DataSource({
    type: "oracle",
    connectString: "admlab2.cs.put.poznan.pl:1521/dblab02_students.cs.put.poznan.pl",
    username: process.env.DB_USER,
    password: process.env.DB_USER,
    synchronize: true
});

AppDataSource.initialize().then(() => {
    console.log("Data Source has been initialized!");

    app.get('/', (req: Request, res: Response) => {
    });
    
    app.listen(port, () => {
      console.log(`⚡️[server]: Server is running at http://localhost:${port}`);
    });

}).catch((err) => {
    console.error("Error during Data Source initialization", err);
});