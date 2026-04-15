import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/password.js";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const prisma = new PrismaClient();

const categories = [
  {
    name: "Hamburguesas",
    order: 1,
    products: [
      { name: "Clasica", price: "8.50", description: "Ternera, lechuga, tomate y salsa burger." },
      { name: "BBQ Bacon", price: "10.50", description: "Cheddar, bacon crujiente y salsa barbacoa." },
      { name: "Doble Smash", price: "11.00", description: "Doble carne smash, cheddar y pepinillo." },
      { name: "Crispy Chicken", price: "9.50", description: "Pollo crujiente, lechuga y mayonesa." },
      { name: "Veggie", price: "9.00", description: "Burger vegetal, guacamole y cebolla morada." }
    ]
  },
  {
    name: "Entrantes",
    order: 2,
    products: [
      { name: "Nachos con queso", price: "6.50", description: "Nachos con cheddar fundido y jalapenos." },
      { name: "Alitas BBQ", price: "7.50", description: "Alitas glaseadas con salsa BBQ casera." },
      { name: "Aros de cebolla", price: "5.50", description: "Aros crujientes con salsa ranch." },
      { name: "Patatas bravas", price: "4.50", description: "Patata gajo con salsa brava y alioli." }
    ]
  },
  {
    name: "Bebidas",
    order: 3,
    products: [
      { name: "Coca-Cola", price: "2.50", description: "Refresco de cola bien frio." },
      { name: "Agua", price: "1.50", description: "Agua mineral 50cl." },
      { name: "Cerveza", price: "2.80", description: "Cana de cerveza rubia." },
      { name: "Cerveza especial", price: "3.50", description: "Botella de cerveza especial." },
      { name: "Refresco", price: "2.50", description: "Naranja, limon o te frio." }
    ]
  },
  {
    name: "Postres",
    order: 4,
    products: [
      { name: "Brownie", price: "4.50", description: "Brownie templado con nueces." },
      { name: "Cheesecake", price: "5.00", description: "Tarta de queso cremosa." },
      { name: "Helado", price: "3.50", description: "Dos bolas a elegir." }
    ]
  },
  {
    name: "Extras",
    order: 5,
    products: [
      { name: "Extra queso", price: "1.00", description: "Loncha extra de cheddar." },
      { name: "Extra bacon", price: "1.50", description: "Bacon crujiente adicional." },
      { name: "Extra guacamole", price: "2.00", description: "Racion de guacamole casero." }
    ]
  }
] as const;

async function main() {
  const adminPasswordHash = await hashPassword("admin123");

  await prisma.$transaction([
    prisma.authorizedDevice.deleteMany(),
    prisma.orderItem.deleteMany(),
    prisma.order.deleteMany(),
    prisma.bill.deleteMany(),
    prisma.cashRegister.deleteMany(),
    prisma.product.deleteMany(),
    prisma.category.deleteMany(),
    prisma.table.deleteMany(),
    prisma.user.deleteMany(),
    prisma.restaurant.deleteMany()
  ]);

  const restaurant = await prisma.restaurant.create({
    data: {
      name: "Burger House",
      email: "admin@burgerhouse.com",
      passwordHash: adminPasswordHash,
      address: "Calle Mayor 123, Madrid",
      phone: "+34 910 000 000",
      logoUrl: null
    }
  });

  await prisma.user.createMany({
    data: [
      {
        name: "Carlos",
        pin: "1234",
        role: "ADMIN",
        restaurantId: restaurant.id
      },
      {
        name: "Maria",
        pin: "1111",
        role: "WAITER",
        restaurantId: restaurant.id
      },
      {
        name: "Pedro",
        pin: "2222",
        role: "WAITER",
        restaurantId: restaurant.id
      },
      {
        name: "Cocina",
        pin: "3333",
        role: "KITCHEN",
        restaurantId: restaurant.id
      }
    ]
  });

  for (const category of categories) {
    const createdCategory = await prisma.category.create({
      data: {
        name: category.name,
        order: category.order,
        restaurantId: restaurant.id,
        active: true
      }
    });

    await prisma.product.createMany({
      data: category.products.map((product) => ({
        name: product.name,
        description: product.description,
        price: product.price,
        categoryId: createdCategory.id,
        restaurantId: restaurant.id,
        available: true
      }))
    });
  }

  await prisma.table.createMany({
    data: [
      ...Array.from({ length: 8 }, (_, index) => ({
        number: index + 1,
        name: null,
        zone: "Interior",
        capacity: 4,
        restaurantId: restaurant.id,
        status: index === 7 ? "RESERVED" : "FREE"
      })),
      ...Array.from({ length: 4 }, (_, index) => ({
        number: index + 9,
        name: `Terraza ${index + 1}`,
        zone: "Terraza",
        capacity: 6,
        restaurantId: restaurant.id,
        status: "FREE"
      }))
    ]
  });

  console.log("Seed completado para Burger House.");
}

main()
  .catch((error) => {
    console.error("Error ejecutando el seed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
