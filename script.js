// ======================================
// QBOOK - SUPABASE CONNECTION
// ======================================

const SUPABASE_URL = "https://kdzgphkhpjnqpnbswxmg.supabase.co";

const SUPABASE_KEY = "sb_publishable_t_IjbssJ_yxBW5q0iJ0w_g_30-PM-jO";

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

let currentUser = null;
let currentUserId = null;
let reservations = [];

let authMode = "login";
let selectedBook = null;
let selectedChapter = null;
let reservationChannel = null;

const books = {
  textbook: "کتاب ریاضی هفتم",
  workbook: "ماجرای بیست ریاضی هفتم"
};

// ======================================
// AUTHENTICATION
// ======================================

function setAuthMode(mode) {
  authMode = mode;

  $("loginTab").classList.toggle("active", mode === "login");
  $("signupTab").classList.toggle("active", mode === "signup");

  $("authSubmit").textContent =
    mode === "login" ? "ورود به QBOOK" : "ساخت حساب کاربری";

  $("authMessage").textContent = "";
}

$("loginTab").addEventListener("click", () => {
  setAuthMode("login");
});

$("signupTab").addEventListener("click", () => {
  setAuthMode("signup");
});

// ======================================
// LOGIN AND SIGNUP
// ======================================

$("authForm").addEventListener("submit", async event => {
  event.preventDefault();

  const username = $("username").value.trim();
  const email = $("email").value.trim();
  const password = $("password").value;

  if (username.length < 3 || password.length < 4 || !email) {
    $("authMessage").textContent =
      "لطفاً اطلاعات را به درستی وارد کنید.";
    return;
  }

  const submitButton = $("authSubmit");

  submitButton.disabled = true;
  submitButton.textContent = "لطفاً صبر کنید...";

  try {

    if (authMode === "signup") {

      const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
          data: {
            username: username
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        setCurrentUser(data.user);
        await showApp();
      } else {
        $("authMessage").textContent =
          "حساب ساخته شد! ایمیلت را باز کن و ثبت‌نامت را تأیید کن، سپس وارد شو.";
      }

    } else {

      const { data, error } =
        await supabaseClient.auth.signInWithPassword({
          email,
          password
        });

      if (error) throw error;

      setCurrentUser(data.user);
      await showApp();
    }

  } catch (error) {

    console.error(error);

    $("authMessage").textContent =
      error.message || "مشکلی پیش آمد. دوباره تلاش کن.";

  } finally {

    submitButton.disabled = false;

    submitButton.textContent =
      authMode === "login"
        ? "ورود به QBOOK"
        : "ساخت حساب کاربری";
  }
});

// ======================================
// CURRENT USER
// ======================================

function setCurrentUser(user) {
  currentUserId = user.id;

  currentUser =
    user.user_metadata?.username ||
    user.email ||
    "کاربر";
}

// ======================================
// LOGOUT
// ======================================

async function logout() {

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    alert("خروج انجام نشد: " + error.message);
    return;
  }

  currentUser = null;
  currentUserId = null;
  reservations = [];

  selectedBook = null;
  selectedChapter = null;

  if (reservationChannel) {
    await supabaseClient.removeChannel(reservationChannel);
    reservationChannel = null;
  }

  $("authScreen").hidden = false;
  $("appScreen").hidden = true;
  $("userArea").innerHTML = "";

  $("username").value = "";
  $("email").value = "";
  $("password").value = "";

  $("chapterSection").hidden = true;
  $("questionSection").hidden = true;

  document.querySelectorAll(".book-card").forEach(card => {
    card.classList.remove("selected");
  });

  setAuthMode("login");
}

// ======================================
// SHOW WEBSITE
// ======================================

async function showApp() {

  $("authScreen").hidden = true;
  $("appScreen").hidden = false;

  $("userArea").innerHTML = "";

  const name = document.createElement("span");
  name.textContent = "👋 " + currentUser;

  const logoutButton = document.createElement("button");
  logoutButton.className = "logout-btn";
  logoutButton.textContent = "خروج";
  logoutButton.addEventListener("click", logout);

  $("userArea").append(name, logoutButton);

  await loadReservations();

  renderChapters();
  renderStats();
  renderMyReservations();

  if (selectedBook && selectedChapter) {
    $("chapterSection").hidden = false;
    $("questionSection").hidden = false;
    renderQuestions();
  }

  subscribeToReservations();
}

// ======================================
// LOAD SHARED RESERVATIONS
// ======================================


async function loadReservations() {
  const { data, error } = await supabaseClient
    .from("reservations")
    .select("id, book, chapter, question_number, user_id, username");

  if (error) {
    console.error("Error loading reservations:", error);
    alert("دریافت رزروها با مشکل مواجه شد: " + error.message);
    return;
  }

  reservations = (data || []).map(q => ({
    id: q.id,
    book: q.book,
    chapter: q.chapter,
    number: q.question_number,
    user_id: q.user_id,
    username: q.username
  }));
}

// ======================================
// REAL-TIME UPDATES
// ======================================

function subscribeToReservations() {

  if (reservationChannel) return;

  reservationChannel = supabaseClient
    .channel("qbook-live-reservations")
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "reservations"
      },
      async () => {

        await loadReservations();

        renderStats();
        renderMyReservations();

        if (selectedBook && selectedChapter) {
          renderQuestions();
        }
      }
    )
    .subscribe();
}

// ======================================
// CHOOSE BOOK
// ======================================

document.querySelectorAll(".book-card").forEach(button => {

  button.addEventListener("click", () => {

    selectedBook = button.dataset.book;
    selectedChapter = null;

    document.querySelectorAll(".book-card").forEach(card => {
      card.classList.toggle("selected", card === button);
    });

    $("chapterSection").hidden = false;
    $("questionSection").hidden = true;

    renderChapters();
  });
});

// ======================================
// CHOOSE CHAPTER
// ======================================

function renderChapters() {

  $("chapterGrid").innerHTML = "";

  for (let i = 1; i <= 9; i++) {

    const button = document.createElement("button");

    button.className = "chapter-btn";
    button.textContent = "فصل " + i;

    button.addEventListener("click", () => {

      selectedChapter = i;

      document.querySelectorAll(".chapter-btn").forEach(card => {
        card.classList.toggle("selected", card === button);
      });

      $("questionSection").hidden = false;

      $("selectionInfo").textContent =
        books[selectedBook] + " — فصل " + i;

      renderQuestions();
    });

    $("chapterGrid").appendChild(button);
  }
}

// ======================================
// FIND RESERVATION
// ======================================

function findReservation(book, chapter, number) {

  return reservations.find(q =>
    q.book === book &&
    q.chapter === chapter &&
    q.number === number
  );
}

// ======================================
// SHOW QUESTIONS
// ======================================

function renderQuestions() {

  $("questionGrid").innerHTML = "";

  if (!selectedBook || !selectedChapter) return;

  for (let i = 1; i <= 100; i++) {

    const reservation = findReservation(
      selectedBook,
      selectedChapter,
      i
    );

    const button = document.createElement("button");
    button.className = "question-btn";

    const number = document.createElement("strong");
    number.textContent = i;

    const status = document.createElement("small");

    if (!reservation) {

      button.classList.add("available");
      status.textContent = "آزاد";

      button.addEventListener("click", () => {
        reserveQuestion(i);
      });

    } else if (reservation.user_id === currentUserId) {

      button.classList.add("owned");
      status.textContent = "مال تو";

    } else {

      button.classList.add("reserved");
      button.disabled = true;
      status.textContent = reservation.username;
    }

    button.append(number, status);
    $("questionGrid").appendChild(button);
  }
}

// ======================================
// RESERVE QUESTION
// ======================================

async function reserveQuestion(number) {

  if (!currentUserId) {
    alert("ابتدا وارد حساب کاربری شو!");
    return;
  }

  if (findReservation(selectedBook, selectedChapter, number)) {
    alert("این سؤال قبلاً رزرو شده است!");
    renderQuestions();
    return;
  }

  // Insert directly into the shared database.
  // The database UNIQUE constraint prevents duplicate reservations.

  const { error } = await supabaseClient
    .from("reservations")
    .insert({
      book: selectedBook,
      chapter: selectedChapter,
      question_number: number,
      user_id: currentUserId,
      username: currentUser
    });

  if (error) {

    if (error.code === "23505") {
      alert("این سؤال را شخص دیگری زودتر رزرو کرده است! 😭");
    } else {
      console.error(error);
      alert("رزرو انجام نشد: " + error.message);
    }

    await loadReservations();

    renderQuestions();
    renderStats();
    renderMyReservations();

    return;
  }

  await loadReservations();

  renderQuestions();
  renderStats();
  renderMyReservations();

  alert("سؤال " + number + " با موفقیت رزرو شد! 💙");
}

// ======================================
// MY RESERVATIONS
// ======================================

function renderMyReservations() {

  const mine = reservations.filter(
    q => q.user_id === currentUserId
  );

  $("myReservations").innerHTML = "";

  if (mine.length === 0) {

    $("myReservations").innerHTML =
      '<div class="empty">هنوز هیچ سؤالی رزرو نکردی! 👀</div>';

    return;
  }

  mine.forEach(q => {

    const card = document.createElement("div");
    card.className = "reservation-card";

    const info = document.createElement("div");

    const title = document.createElement("strong");
    title.textContent = "سؤال شماره " + q.number;

    const detail = document.createElement("p");
    detail.textContent =
      books[q.book] + " · فصل " + q.chapter;

    info.append(title, detail);

    const cancel = document.createElement("button");
    cancel.className = "cancel-btn";
    cancel.textContent = "لغو رزرو";

    cancel.addEventListener("click", async () => {

      if (!confirm("مطمئنی می‌خوای رزرو رو لغو کنی؟")) {
        return;
      }

      const { error } = await supabaseClient
        .from("reservations")
        .delete()
        .eq("id", q.id)
        .eq("user_id", currentUserId);

      if (error) {
        console.error(error);
        alert("لغو رزرو انجام نشد: " + error.message);
        return;
      }

      await loadReservations();

      renderQuestions();
      renderStats();
      renderMyReservations();

      alert("رزرو با موفقیت لغو شد! 💙");
    });

    card.append(info, cancel);

    $("myReservations").appendChild(card);
  });
}

// ======================================
// STATISTICS
// ======================================

function renderStats() {

  $("totalReserved").textContent = reservations.length;

  $("myReserved").textContent =
    reservations.filter(q => q.user_id === currentUserId).length;
}

// ======================================
// START WEBSITE
// ======================================

async function initializeQBook() {

  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error(error);
    $("authMessage").textContent = "خطا در اتصال به حساب کاربری.";
    return;
  }

  if (data.session) {

    setCurrentUser(data.session.user);
    await showApp();

  } else {

    $("authScreen").hidden = false;
    $("appScreen").hidden = true;
  }
}

// Handle session expiration or sign-out.

supabaseClient.auth.onAuthStateChange((event, session) => {

  if (event === "SIGNED_OUT") {

    currentUser = null;
    currentUserId = null;
    reservations = [];

    $("authScreen").hidden = false;
    $("appScreen").hidden = true;
    $("userArea").innerHTML = "";
  }
});

initializeQBook();
