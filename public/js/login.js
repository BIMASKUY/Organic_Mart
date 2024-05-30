const container = document.getElementById('container');
const registerBtn = document.getElementById('register');
const loginBtn = document.getElementById('login');

registerBtn.addEventListener('click', () => {
    container.classList.add("active");
});

loginBtn.addEventListener('click', () => {
    container.classList.remove("active");
});

// Mine

forgetPassword.addEventListener('click', async (event) => {
    event.preventDefault()
    const { value: email } = await Swal.fire({
        title: "Enter Your Email Address",
        input: "email",
        inputPlaceholder: "your email"
    })
    if(email) Swal.fire(`Please Check Your Email\n${email}`)
})