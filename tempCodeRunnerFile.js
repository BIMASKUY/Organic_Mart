
const username = 'admin'
const password = '" union select 1 as id, "admin" as username, "pass" as password --'

const query = 'SELECT * FROM users WHERE username = "' + username + '" and password = "' + password + '"'

console.log(query)