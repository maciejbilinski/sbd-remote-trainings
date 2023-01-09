# Przygotowanie środowiska
1. Pobierz [NodeJS](https://nodejs.org/en/download/) (zalecana wersja 18.13 z npm 8.19.3)
2. Skonfiguruj [VPN](https://instrukcje.put.poznan.pl/category/vpn/) do połączenia się z uczelnianą bazą danych
3. Za pomocą [SQL Developer lub SQL Developer Web](https://ekursy.put.poznan.pl/mod/page/view.php?id=1001247) połącz się z bazą danych i wywołaj skrypt **db/relational.ddl**. *Możesz też przeczyścić bazę skryptem **db/clean.sql***.
4. Stwórz i wypełnij plik **.env** danymi do swojego konta.
5. Wywołaj w terminalu:
```
npm install
```
# Uruchamianie
Wywołaj w terminalu:

    npm run dev

Otwórz w przeglądarce [http://localhost:8080](http://localhost:8080).

# Opis funkcjonalności projektu
Celem naszego projektu jest stworzenie aplikacji webowej do zarządzania treningami siłowymi. Aplikacja ma umożliwiać tworzenie ćwiczeń ze wskazywaniem potrzebnego asortymentu (np. do ćwiczenia Matwy Ciąg potrzebujemy sztangę), treningów składających się z ćwiczeń oraz na wykonywanie treningów poprzez tworzenie historii. Podczas wykonywania treningu zapisywane będą dane o ilości wykonanych serii, powtórzeń oraz o wykorzystywanym ciężarze. Dodatkowo planujemy stworzyć moduł społeczności i pozwolić na ocenianie (np. w skali od 1 do 10) ćwiczeń oraz treningów w kilku kategoriach (np. trudność, skuteczność, intensywność, dostępność). 

# Projekty ekranów
## Strona początkowa
Podstrona, na którą przekierowywani są wszyscy niezalogowani użytkownicy.
Można się na niej zalogować lub zarejestrować do systemu za pomocą bardzo prostego formularza. Po ukończeniu akcji następuje przekierowanie na Kokpit.

## Kokpit
Podstrona domowa dla wszystkich zalogowanych użytkowników.
Dużą część ekranu zajmuje wykres, który na osi X ma daty, zgrupowane do tygodni roku a na osi y sumaryczne czasy trwania wykonanych treningowych w danym tygodniu – jest to element, który ma motywować użytkownika i pokazywać mu, że np. w czerwcu dużo więcej trenował niż w grudniu.

Zawiera kafelki przekierowujące do następnych podstron. Dokładnie do: kreatora treningów, kreatora ćwiczeń, kreatora sprzętu, wyszukiwarki treningów, wyszukiwarki ćwiczeń, planów treningowych użytkownika, wyszukiwarka sprzętu.

Na tej podstronie znajduje się też przejście do personalizacji konta (ikona śrubki) i istnieje opcja wylogowania się z systemu za pomocą przycisku.

## Personalizacja konta
Podstrona dająca możliwość zmiany preferowanej jednostki (modyfikacji tabeli uzytkownicy) za pomocą prostego formularza.
Na tej podstronie można też usunąć konto klikając w przycisk i potwierdzając akcję.

## Kreator treningów
Na tej podstronie wpisujemy nazwę treningu oraz określamy jego prywatność, a następnie wybieramy z listy ćwiczeń, wszystkie ćwiczenia, które ma zawierać nasz trening. Ćwiczenia dodajemy za pomocą kliknięcia w panel ćwiczenia i w ten sam sposób można usunąć ćwiczenie z naszego treningu tzn. można „odklikać”. Jest tutaj też przejście do kreatora ćwiczenia, który zostanie wstrzyknięty jako widget. Cały proces potwierdzamy przyciskiem.

## Kreator ćwiczeń
Użytkownik wpisuje w formularzu nazwę ćwiczenia, określa czy ćwiczenie jest wykonywane na powtórzenia, czy na czas oraz opcjonalnie wgrywa filmik z instruktażem. Dodatkowo wybiera z listy sprzęt analogicznie jak wybierało się ćwiczenia w kreatorze treningów. Również jest opcja dodania w locie nowego sprzętu. Całość potwierdza się przyciskiem.

## Kreator sprzętu
Użytkownik wpisuje w formularzu nazwę sprzętu, określa czy ćwiczenie jest wykonywane z własnym ciałem, czy z obciążeniem i opcjonalnie wgrywa zdjęcie.

## Wyszukiwarka treningów
Użytkownik widzi na liście wszystkie publiczne treningi. Po kliknięciu w trening otwiera mu się mniejszy panel, na którym może ocenić trening w kilku kategoriach lub dodać go jako swój plan treningowy (wtedy zostanie przekierowany na kreator planu treningowego). Trening można też znaleźć za pomocą wyszukiwarki tekstowej.

## Treningi użytkownika
Użytkownik widzi na liście wszystkie swoje stworzone treningi i może je usunąć z bazy danych za pomocą ikony kosza. Podczas usuwania włączy się komunikat potwierdzający.

## Wyszukiwarka ćwiczeń
Użytkownik widzi na liście wszystkie ćwiczenia i może je oceniać po kliknięciu, analogicznie jak w wyszukiwarce treningów. Po kliknięciu jest też możliwość dodaniu instruktażu jeżeli ćwiczenie go nie posiada. Ćwiczenie można też znaleźć za pomocą wyszukiwarki tekstowej.

## Wyszukiwarka sprzętu
Użytkownik widzi na liście wszystkie sprzęty z bazy danych i może kliknąć w sprzęt, który nie zawiera zdjęcia. Pokaże mu się wtedy panel dodania zdjęcia.

## Kreator planu treningowego
Jest to podstrona, na które użytkownik może dodać dowolną ilość dni treningowych oraz opcjonalnie określić datę zakończenia wykonywania planu treningowego (pole typu kalendarz). Dodanie dnia treningowego realizowane jest za pomocą przycisku, a opis dnia treningowego jest realizowany za pomocą prostego formularza. Użytkownik może określić dla każdego dnia czy chce otrzymywać powiadomienie-przypominajkę czy nie - jest to realizowane checkboxem. Jest też możliwość usunięcia dnia treningowego. Całość potwierdza się przyciskiem Zapisz.

## Plany treningowe użytkownika
Użytkownik widzi panel podzielony na dwie części – aktualne plany treningowe i zakończone. Podstrona zbudowana jest za pomocą widgetów typu show/hide. Domyślnie zakończone plany treningowe są ukryte, a aktualne pokazane. Dla każdego aktualnego planu treningowego użytkownik może kliknąć ikonę edycji i zostanie przekierowany do kreatora planu treningowego, gdzie może dowolnie zmieniać datę zakończenia i dni treningowe – nie ma takiej możliwości dla zakończonych treningów. Dla każdego aktualnego planu treningowego użytkownik może również kliknąć przycisk „Rozpocznij trening” – zostanie wtedy przekierowany do podstrony Wykonywanie treningu.

## Wykonywanie treningu
Użytkownik widzi wszystkie ćwiczenia przedstawione za pomocą kafelków, pole wyboru reprezentujące zmęczenie – najlepszy moment aby je wypełnić to zakończenie treningu i przycisk „Zakończ trening”. Po kliknięciu w pokazuje mu się panel wykonywania ćwiczenia.
Panel wykonywania ćwiczenia posiada przycisk dodania serii, listę sprzętu z obrazkami (jeżeli mają zdjęcia, w innym przypadku jakiś obrazek zastępczy typu „Brak fotografii”) oraz instruktaż (oczywiście dla wszystkich ćwiczeń, które go posiadają). Dodanie serii uruchamia licznik czasu dla ćwiczeń niepowtórzeniowych. Następnie użytkownik wykonuje fizycznie ćwiczenie. Pod koniec wypełnia pole numeryczne reprezentujące ilość powtórzeń dla ćwiczeń powtórzeniowych i dodaje obciążenia wszystkich sprzętów, które mają różne obciążenia i należą do ćwiczenia. Dodatkowo strona ma pokazywać dla każdego ćwiczenia dane treningowego z poprzedniego razu tzn. informacja typu „Poprzednio: SERIA 1 – 12kg/15 powtórzeń; SERIA 2 – 15 kg/10 powtórzeń;”. Całość potwierdza przyciskiem „Zakończ serię”. Uwaga! Może się tak zdarzyć, że ćwiczenie jest niepowtórzeniowe i nie zawiera żadnego sprzętu obciążeniowego (takim ćwiczeniem jest np. deska/plank), wtedy ten panel jest bardzo prosty – zawiera tylko przycisk zakończ serię.

Użytkownik może dodać tyle serii ile chce i wykonać tyle ćwiczeń ile chce – nie ma odgórnego wymagania, żeby wykonał każde ćwiczenie albo konkretną ilość serii.
