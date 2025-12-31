import { Router } from "express"



const authRouter = Router();

authRouter.post("/", async (req, res) => {
  try {
    res.clearCookie("token", {
      httpOnly: true,
      secure: true,           
       sameSite: "none",       
    })
    return res.json({ message: "Logged out successfully" })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: "Failed to log out" })
  }
})

export default authRouter