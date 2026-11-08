// /api/core/auth/*  register, login (JWT), refresh, me
import { ApiError, currentUser, parse, requireAuth, signToken, TokenError, verifyToken } from "@threads/shared";
import bcrypt from "bcryptjs";
import { Router } from "express";
import { tokenSettings } from "../../config";
import { prisma, Prisma } from "../../db";
import { loginSchema, refreshSchema, registerSchema } from "./schemas";
import { passwordProblem } from "./passwordRules";

const BCRYPT_COST = 12;
// Compared against when the email doesn't exist, so "unknown email" and
// "wrong password" take the same time (no user enumeration through timing).
const DUMMY_HASH = bcrypt.hashSync("dummy-password-for-timing", BCRYPT_COST);

export const userJson = (u: { id: number; email: string; firstName: string; lastName: string }) => ({
  id: u.id,
  email: u.email,
  first_name: u.firstName,
  last_name: u.lastName,
});

const EMAIL_TAKEN = "Email: A user with this email already exists.";

export const authRouter = Router();

authRouter.post("/register", async (req, res) => {
  const input = parse(registerSchema, req.body);

  if (await prisma.user.findUnique({ where: { email: input.email } })) {
    throw new ApiError(400, EMAIL_TAKEN, { email: ["A user with this email already exists."] });
  }
  const problem = passwordProblem(input.password, input);
  if (problem) throw new ApiError(400, `Password: ${problem}`, { password: [problem] });

  try {
    const user = await prisma.user.create({
      data: {
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, BCRYPT_COST),
        firstName: input.first_name,
        lastName: input.last_name,
      },
    });
    res.status(201).json(userJson(user));
  } catch (e) {
    // Two registrations with the same email at the same moment
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(400, EMAIL_TAKEN);
    }
    throw e;
  }
});

authRouter.post("/login", async (req, res) => {
  const { email, password } = parse(loginSchema, req.body);
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !ok || !user.isActive) throw new ApiError(401, "Invalid email or password.");

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
  res.json({
    access: signToken("access", user, tokenSettings),
    refresh: signToken("refresh", user, tokenSettings),
  });
});

authRouter.post("/refresh", async (req, res) => {
  const { refresh } = parse(refreshSchema, req.body);
  let userId: number;
  try {
    userId = Number(verifyToken(refresh, tokenSettings.secret, "refresh").user_id);
  } catch (e) {
    if (e instanceof TokenError) throw new ApiError(401, "Token is invalid or expired.");
    throw e;
  }
  // The user may have been deactivated since the refresh token was issued
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.isActive) throw new ApiError(401, "Token is invalid or expired.");
  res.json({ access: signToken("access", user, tokenSettings) });
});

authRouter.get("/me", requireAuth(tokenSettings.secret), async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: currentUser(req).id } });
  if (!user || !user.isActive) throw new ApiError(401, "Invalid session. Please log in again.");
  res.json(userJson(user));
});
