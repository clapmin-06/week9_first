// 로컬 실행 진입점
const app = require("./app");
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`http://localhost:${PORT}`));
