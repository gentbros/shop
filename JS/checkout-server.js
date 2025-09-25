
// const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzWYI1c2vshCsbpsU7MYPtRiKZ3Kbjqvwg84uSzOjxyAPbRBUxvIYnBsPtE_aSA7RJJYw/exec";

// // const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxcWFddgIUHnWSoTFWUhkU17hGmdwKHgjnZxbdwf9UX9Vlb4CTQkkaDHEsE1b9c4KMB/exec";


// document.getElementById("checkoutForm").addEventListener("submit", function(e) {
//   e.preventDefault();

//   // ✅ Collect cart + delivery + form data
//   const cart = CartUtils.getCart();
//   const delivery = CartUtils.getDeliveryChoice();
//   const fullName = document.getElementById("fullName").value.trim();
//   const phoneNumber = document.getElementById("phoneNumber").value.trim();
//   const streetAddress = document.getElementById("streetAddress").value.trim();
//   const additionalNotes = document.getElementById("additionalNotes").value.trim();
//   const couponCode = document.getElementById("couponCode").value.trim();

//   // Flatten cart into comma-separated for id/title/image/price
//   const ids = cart.map(i => i.id).join(",");
//   const titles = cart.map(i => i.title).join(",");
//   const images = cart.map(i => (i.image ? i.image.split("/").pop() : "none")).join(",");
//   const prices = cart.map(i => `৳${i.price}`).join(",");

//   // Products JSON (color, size, quantity)
//   const products = JSON.stringify(cart.map(i => ({
//     colorName: i.color || null,
//     size: i.size || null,
//     quantity: i.quantity
//   })));

//   // District & Upazila JSON
//   const districtData = JSON.stringify([
//     { District: selectedDistrict || "" },
//     { Upazila: selectedUpazila || "" }
//   ]);

//   // Option Information JSON
//   const optionInformation = JSON.stringify({
//     AdditionalNotes: additionalNotes || "",
//     CouponCode: couponCode || ""
//   });

//   // ✅ Build query string exactly like District & Upazila.html
//   const params = new URLSearchParams({
//     path: "Sheet1",   // change if needed
//     action: "write",
//     id: ids,
//     title: titles,
//     image: images,
//     price: prices,
//     myArea: delivery || "unknown",
//     name: fullName,
//     PhoneNumber: phoneNumber,
//     StreetAddress: streetAddress,
//     products,
//     districtData,
//     optionInformation
//   });

//   // ✅ Show loading overlay
//   document.getElementById("loadingOverlay").classList.remove("hidden");

//   // ✅ Send request
// fetch(`${SCRIPT_URL}?${params.toString()}`)
//   .then(res => res.text())
//   .then(txt => {
//     document.getElementById("loadingOverlay").classList.add("hidden");
//     document.getElementById("successOverlay").classList.remove("hidden");

//     // clear cart
//     localStorage.removeItem("cart");
//     CartUtils.updateCartCount();
//   })
//   .catch(err => {
//     document.getElementById("loadingOverlay").classList.add("hidden");
//     alert("❌ Error: " + err);
//   });



//       CartUtils.saveCheckoutData({
//   Name: fullName,
//   PhoneNumber: phoneNumber,
//   DistrictAndUpazila: { District: selectedDistrict, Upazila: selectedUpazila },
//   StreetAddress: streetAddress,
//   AdditionalNotes: additionalNotes,
//   CouponCode: couponCode
// });



// });


