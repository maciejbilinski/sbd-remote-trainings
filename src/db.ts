import { createPool as oracleCreatePool } from "oracledb"

// ensure that ENV is initialized
export const getPool = async () => oracleCreatePool({
    user: process.env.DB_USER,
    password: process.env.DB_USER,
    connectString: "admlab2.cs.put.poznan.pl:1521/dblab02_students.cs.put.poznan.pl",
});