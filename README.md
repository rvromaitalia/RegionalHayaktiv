# Java Course – Homework Projects

A collection of weekly Java exercises (pure logic + small console demos).  
Focus: clean code, testability, and separation of concerns (logic vs I/O).

## 🧱 Tech Stack
- **JDK:** 17 ( 24.0.2 used in the project) 
- **Build:** Maven 
- **Testing:** JUnit 5, AssertJ (optional)
- **IDE:** IntelliJ IDEA / VS Code (Java Pack)

## 📁 Project Structure
├─ pom.xml
├─ README.md
├─ src
│ ├─ main
│ │ └─ java
│ │ └─ se/lexvaxjo/roman/
│ │ ├─ week41/ ... exercises + Runner.java
│ │ └─ week42/ ...
│ └─ test
│ └─ java
│ └─ se/lexvaxjo/roman/ ... unit tests
└─ .gitignore

# ▶️ Running the Code
Using **Maven**:
```bash
# Run the default Runner
mvn -q -DskipTests exec:java -Dexec.mainClass=se.lexvaxjo.roman.week41.Runner

# (Optional) Pass an exercise name/arg to the Runner
mvn -q -DskipTests exec:java -Dexec.mainClass=se.lexvaxjo.roman.week41.Runner -Dexec.args="greetings"

✅ Running Tests
mvn test
# or
./gradlew test

🗂️ Weeks & Exercises

Week 41

PrintGreetings: returns "Hello,\n<Name>!" (no I/O inside; printing done in Runner).

LeapYearChecker: isLeapYear(int) with unit tests (century & 400-year rules).

IntOperations: add/sub/mult/div using Math.*Exact (+ exception on divide by zero).

GuessTheNumber:

GuessingLogic.compare(secret, guess) (TOO_SMALL / TOO_BIG / CORRECT).

Runner hosts the interactive loop (Scanner), counts attempts.

Week 42
....

🧪 Testing Strategy

🧪 Testing Strategy

Unit tests for all pure logic (no System.out in tests).

Edge cases: null/blank strings, negative numbers, boundary years (e.g., 1900/2000), overflow.

Example (JUnit 5):

@Test void leapYearRules() {
  assertTrue(LeapYearChecker.isLeapYear(2000));
  assertFalse(LeapYearChecker.isLeapYear(1900));
  assertTrue(LeapYearChecker.isLeapYear(2024));
}

📝 Usage Examples

Greetings

System.out.print(PrintGreetings.greetMe("Ali"));
// Output:
// Hello,
// Ali!


Guess the Number (interactive)

Guess a number (1–500): 250
Your guess was too small.
Guess a number (1–500): 375
Your guess was too big.
Guess a number (1–500): 362
Correct! The number was 362. You needed 3 guesses.

🙋 Author

Roman Vanoyan — coursework for Java fundamentals.
