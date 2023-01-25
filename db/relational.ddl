
CREATE TABLE uzytkownicy (
    login                 VARCHAR2(256) PRIMARY KEY,
    preferowana_jednostka CHAR(1) NOT NULL CHECK (preferowana_jednostka IN ('K', 'L'))
);


CREATE TABLE cwiczenia (
    nazwa             VARCHAR2(256) PRIMARY KEY ,
    ma_instruktaz     CHAR(1) NOT NULL CHECK (ma_instruktaz IN ('T', 'N')),
    czy_powtorzeniowe CHAR(1) NOT NULL CHECK (czy_powtorzeniowe IN ('T', 'N'))
);



CREATE TABLE treningi (
    nazwa             VARCHAR2(256) PRIMARY KEY,
    czy_prywatny      CHAR(1) NOT NULL CHECK (czy_prywatny IN ('T', 'N')),
    uzytkownicy_login VARCHAR2(256) NOT NULL,
    FOREIGN KEY (uzytkownicy_login) REFERENCES uzytkownicy(login)
);
CREATE INDEX treningi_idx ON treningi (uzytkownicy_login);



CREATE TABLE sprzet (
    nazwa                VARCHAR2(256) PRIMARY KEY,
    ma_zdjecie           CHAR(1) NOT NULL CHECK (ma_zdjecie IN ('T', 'N')),
    czy_rozne_obciazenie CHAR(1) NOT NULL CHECK (czy_rozne_obciazenie IN ('T', 'N'))
);



CREATE TABLE cwiczeniasprzet (
    cwiczenia_nazwa VARCHAR2(256) NOT NULL,
    sprzet_nazwa    VARCHAR2(256) NOT NULL,
    CONSTRAINT cwiczeniasprzet_pk PRIMARY KEY (cwiczenia_nazwa, sprzet_nazwa),
    FOREIGN KEY ( cwiczenia_nazwa ) REFERENCES cwiczenia ( nazwa ),
    FOREIGN KEY (sprzet_nazwa) REFERENCES sprzet(nazwa)
);



CREATE TABLE cwiczeniatreningi (
    treningi_nazwa  VARCHAR2(256) NOT NULL,
    cwiczenia_nazwa VARCHAR2(256) NOT NULL,
    CONSTRAINT cwiczeniatreningi_pk PRIMARY KEY (cwiczenia_nazwa, treningi_nazwa),
    FOREIGN KEY ( cwiczenia_nazwa ) REFERENCES cwiczenia ( nazwa ),
    FOREIGN KEY ( treningi_nazwa ) REFERENCES treningi ( nazwa )
);





CREATE TABLE ocenycwiczen (
    cena_sprzetu    NUMBER(1, 0) NOT NULL CHECK (cena_sprzetu>=1 AND cena_sprzetu<=5),
    trudnosc          NUMBER(1, 0) NOT NULL CHECK (trudnosc>=1 AND trudnosc<=5),
    intensywnosc      NUMBER(1, 0) NOT NULL CHECK (intensywnosc>=1 AND intensywnosc<=5),
    uzytkownicy_login VARCHAR2(256) NOT NULL,
    cwiczenia_nazwa VARCHAR2(256) NOT NULL,
    FOREIGN KEY (uzytkownicy_login) REFERENCES uzytkownicy(login), 
    CONSTRAINT ocenycwiczen_pk PRIMARY KEY (uzytkownicy_login, cwiczenia_nazwa),
    FOREIGN KEY (cwiczenia_nazwa) REFERENCES cwiczenia(nazwa)
);
CREATE INDEX ocenycwiczen_idx ON ocenycwiczen (cwiczenia_nazwa);
CREATE INDEX ocenycwiczen_idx2 ON ocenycwiczen (uzytkownicy_login);



CREATE TABLE ocenytreningow (
    skutecznosc    NUMBER(1, 0) NOT NULL CHECK (skutecznosc>=1 AND skutecznosc<=5),
    trudnosc          NUMBER(1, 0) NOT NULL CHECK (trudnosc>=1 AND trudnosc<=5),
    intensywnosc      NUMBER(1, 0) NOT NULL CHECK (intensywnosc>=1 AND intensywnosc<=5),
    uzytkownicy_login VARCHAR2(256) NOT NULL,
    treningi_nazwa VARCHAR2(256) NOT NULL,
    FOREIGN KEY (uzytkownicy_login) REFERENCES uzytkownicy(login),
    CONSTRAINT ocenytreningow_pk PRIMARY KEY (uzytkownicy_login, treningi_nazwa),
    FOREIGN KEY (treningi_nazwa) REFERENCES treningi(nazwa)
);
CREATE INDEX ocenytreningow_idx ON ocenytreningow (treningi_nazwa);
CREATE INDEX ocenytreningow_idx2 ON ocenytreningow (uzytkownicy_login);



CREATE TABLE plantreningowy (
    id                NUMBER(38) GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    data_rozpoczecia  TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_zakonczenia  TIMESTAMP,
    uzytkownicy_login VARCHAR2(256) NOT NULL,
    treningi_nazwa    VARCHAR2(256) NOT NULL,
    CONSTRAINT plantreningowy_unq UNIQUE (uzytkownicy_login, treningi_nazwa, data_rozpoczecia),
    FOREIGN KEY (treningi_nazwa) REFERENCES treningi(nazwa),
    FOREIGN KEY (uzytkownicy_login) REFERENCES uzytkownicy(login)
);
CREATE INDEX plantreningowy_idx ON plantreningowy (uzytkownicy_login);



CREATE TABLE dnitreningowe (
    dzien_tygodnia          CHAR(2) NOT NULL CHECK (dzien_tygodnia IN ('PN', 'WT', 'SR', 'CZ', 'PT', 'SB', 'ND')),
    godzina                 NUMBER(4, 0) NOT NULL CHECK (godzina >= 0 AND godzina <= 1440), -- w minutach
    dzien_tyg_przypomnienia CHAR(2) CHECK (dzien_tyg_przypomnienia IS NULL OR dzien_tyg_przypomnienia IN ('PN', 'WT', 'SR', 'CZ', 'PT', 'SB', 'ND')),
    godz_przypomnienia      NUMBER(4, 0) CHECK (godz_przypomnienia IS NULL OR (godz_przypomnienia >= 0 AND godz_przypomnienia <= 1440)),
    plantreningowy_id       NUMBER(38) NOT NULL,
    PRIMARY KEY (dzien_tygodnia, godzina, plantreningowy_id),
    FOREIGN KEY (plantreningowy_id) REFERENCES plantreningowy(id)
);
CREATE INDEX dnitreningowe_idx ON dnitreningowe (plantreningowy_id);



CREATE TABLE wykonanetreningi (
    data_rozpoczecia TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    data_zakonczenia TIMESTAMP,
    ocena_zmeczenia  NUMBER(1, 0) NOT NULL CHECK (ocena_zmeczenia>=1 AND ocena_zmeczenia<=5),
    id               NUMBER(38) GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plantreningowy_id NUMBER(38) NOT NULL,
    CONSTRAINT wykonanetreningi_unq UNIQUE (data_rozpoczecia, plantreningowy_id),
    FOREIGN KEY (plantreningowy_id) REFERENCES plantreningowy(id)

);
CREATE INDEX wykonanetreningi_idx ON wykonanetreningi (plantreningowy_id);



CREATE TABLE wykonanecwiczenia (
    seria               NUMBER(4, 0) NOT NULL CHECK (seria > 0),
    wysilek             NUMBER(38) NOT NULL,
    cwiczenia_nazwa     VARCHAR2(256) NOT NULL,
    wykonanetreningi_id NUMBER(38) NOT NULL,
    id                      NUMBER(38) GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    CONSTRAINT wykonanecwiczenia_unq UNIQUE (wykonanetreningi_id, cwiczenia_nazwa, seria),
    FOREIGN KEY (cwiczenia_nazwa) REFERENCES cwiczenia(nazwa),
    FOREIGN KEY (wykonanetreningi_id) REFERENCES wykonanetreningi(id)
);
CREATE INDEX wykonanecwiczenia_idx ON wykonanecwiczenia (wykonanetreningi_id);



CREATE TABLE obciazenia (
    obciazenie                            NUMBER NOT NULL CHECK (obciazenie >= 0), 
    wykonanecwiczenia_id                  NUMBER(38) NOT NULL, 
    sprzet_nazwa                          VARCHAR2(256) NOT NULL,
    PRIMARY KEY (wykonanecwiczenia_id, sprzet_nazwa),
    FOREIGN KEY (wykonanecwiczenia_id) REFERENCES wykonanecwiczenia(id),
    FOREIGN KEY (sprzet_nazwa) REFERENCES sprzet(nazwa)
);



CREATE OR REPLACE PROCEDURE ZmienJednostke (
    pLogin IN VARCHAR2
) AS
    vStara CHAR(1);
    vNowa CHAR(1);
    vMnoznik NUMBER;
BEGIN
    SELECT preferowana_jednostka INTO vStara FROM uzytkownicy WHERE login=pLogin;

    IF vStara = 'K' THEN
        vNowa := 'L';
        vMnoznik := 2.20462262185;
    ELSE
        vNowa := 'K';
        vMnoznik := 0.45359237;
    END IF;
    
    UPDATE obciazenia SET obciazenie=vMnoznik*obciazenie WHERE wykonanecwiczenia_id IN (
        SELECT id FROM wykonanecwiczenia WHERE wykonanetreningi_id IN (
            SELECT id FROM wykonanetreningi WHERE plantreningowy_id IN (
                SELECT id FROM plantreningowy WHERE uzytkownicy_login=pLogin
            )    
        )
    );
    UPDATE uzytkownicy SET preferowana_jednostka=vNowa WHERE login=pLogin;
EXCEPTION
       WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20001, 'Nie znaleziono uzytkownika!');
END ZmienJednostke;
/



CREATE OR REPLACE FUNCTION SumaObciazen (
    pLogin IN Uzytkownicy.login%TYPE,
    pWynikowaJednostka IN Uzytkownicy.preferowana_jednostka%TYPE
) RETURN Obciazenia.obciazenie%TYPE
IS
    vPreferowanaJednostka Uzytkownicy.preferowana_jednostka%TYPE;
    vSumaObciazen Obciazenia.obciazenie%TYPE;
BEGIN
    IF pWynikowaJednostka NOT IN ('K', 'L') THEN
        RAISE_APPLICATION_ERROR(-20000, 'Niepoprawna jednostka!');
    END IF;

    SELECT preferowana_jednostka
    INTO vPreferowanaJednostka
    FROM Uzytkownicy WHERE login = pLogin;

    SELECT SUM(obciazenie)
    INTO vSumaObciazen
    FROM (
        SELECT o.obciazenie, t.uzytkownicy_login from Obciazenia o
        JOIN WykonaneCwiczenia wc ON o.wykonanecwiczenia_id = wc.id
        JOIN Cwiczenia c ON wc.cwiczenia_nazwa = c.nazwa
        JOIN CwiczeniaTreningi ct ON c.nazwa = ct.cwiczenia_nazwa
        JOIN Treningi t ON ct.treningi_nazwa = t.nazwa
        WHERE t.uzytkownicy_login = pLogin
    );

    IF vPreferowanaJednostka = 'K' AND pWynikowaJednostka = 'L' THEN
        vSumaObciazen := vSumaObciazen * 2.20462262185;
    ELSIF vPreferowanaJednostka = 'L' AND pWynikowaJednostka = 'K' THEN
        vSumaObciazen := vSumaObciazen * 0.45359237;
    END IF;

    RETURN vSumaObciazen;
EXCEPTION
       WHEN NO_DATA_FOUND THEN
            RAISE_APPLICATION_ERROR(-20001, 'Nie znaleziono uzytkownika!');
END SumaObciazen;
/