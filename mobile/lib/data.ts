// Dummy data migrated from food_ordering-main for reference Firestore/preview seeds.
// This file is not imported at runtime; it's kept for documentation/testing helpers.
export const dummyData = {
    categories: [
        { name: "Burgers", description: "Juicy grilled burgers" },
        { name: "Pizzas", description: "Oven-baked cheesy pizzas" },
        { name: "Burritos", description: "Rolled Mexican delights" },
        { name: "Sandwiches", description: "Stacked and stuffed sandwiches" },
        { name: "Wraps", description: "Rolled up wraps packed with flavor" },
        { name: "Bowls", description: "Balanced rice and protein bowls" }
    ],
    customizations: [
        { name: "Extra Cheese", price: 25, type: "topping" },
        { name: "Jalapenos", price: 20, type: "topping" },
        { name: "Onions", price: 10, type: "topping" },
        { name: "Olives", price: 15, type: "topping" },
        { name: "Mushrooms", price: 18, type: "topping" },
        { name: "Tomatoes", price: 10, type: "topping" },
        { name: "Bacon", price: 30, type: "topping" },
        { name: "Avocado", price: 35, type: "topping" },
        { name: "Coke", price: 30, type: "side" },
        { name: "Fries", price: 35, type: "side" },
        { name: "Garlic Bread", price: 40, type: "side" },
        { name: "Chicken Nuggets", price: 50, type: "side" },
        { name: "Iced Tea", price: 28, type: "side" },
        { name: "Salad", price: 33, type: "side" },
        { name: "Potato Wedges", price: 38, type: "side" },
        { name: "Mozzarella Sticks", price: 45, type: "side" },
        { name: "Sweet Corn", price: 25, type: "side" },
        { name: "Choco Lava Cake", price: 42, type: "side" }
    ],
    menu: [
        {
            name: "Classic Cheeseburger",
            description: "Beef patty, cheese, lettuce, tomato",
            image_url: "https://static.vecteezy.com/system/resources/previews/044/844/600/large_2x/homemade-fresh-tasty-burger-with-meat-and-cheese-classic-cheese-burger-and-vegetable-ai-generated-free-png.png",
            price: 25.99,
            rating: 4.5,
            calories: 550,
            protein: 25,
            category_name: "Burgers",
            customizations: ["Extra Cheese", "Coke", "Fries", "Onions", "Bacon"]
        },
        {
            name: "Pepperoni Pizza",
            description: "Loaded with cheese and pepperoni slices",
            image_url: "https://static.vecteezy.com/system/resources/previews/023/742/417/large_2x/pepperoni-pizza-isolated-illustration-ai-generative-free-png.png",
            price: 30.99,
            rating: 4.7,
            calories: 700,
            protein: 30,
            category_name: "Pizzas",
            customizations: ["Extra Cheese", "Jalapenos", "Garlic Bread", "Coke", "Olives"]
        },
        {
            name: "Bean Burrito",
            description: "Stuffed with beans, rice, salsa",
            image_url: "https://static.vecteezy.com/system/resources/previews/055/133/581/large_2x/deliciously-grilled-burritos-filled-with-beans-corn-and-fresh-vegetables-served-with-lime-wedge-and-cilantro-isolated-on-transparent-background-free-png.png",
            price: 20.99,
            rating: 4.2,
            calories: 480,
            protein: 18,
            category_name: "Burritos",
            customizations: ["Jalapenos", "Iced Tea", "Fries", "Salad"]
        },
        {
            name: "BBQ Bacon Burger",
            description: "Smoky BBQ sauce, crispy bacon, cheddar",
            image_url: "https://static.vecteezy.com/system/resources/previews/060/236/245/large_2x/a-large-hamburger-with-cheese-onions-and-lettuce-free-png.png",
            price: 27.5,
            rating: 4.8,
            calories: 650,
            protein: 29,
            category_name: "Burgers",
            customizations: ["Onions", "Fries", "Coke", "Bacon", "Avocado"]
        },
        {
            name: "Chicken Caesar Wrap",
            description: "Grilled chicken, lettuce, Caesar dressing",
            image_url: "https://static.vecteezy.com/system/resources/previews/048/930/603/large_2x/caesar-wrap-grilled-chicken-isolated-on-transparent-background-free-png.png",
            price: 21.5,
            rating: 4.4,
            calories: 490,
            protein: 28,
            category_name: "Wraps",
            customizations: ["Extra Cheese", "Coke", "Potato Wedges", "Tomatoes"]
        }
        // (Truncated for brevity; full list retained in original source if needed)
    ]
};

export default dummyData;
