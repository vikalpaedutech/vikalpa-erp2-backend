import Mailgen from "mailgen";
import nodemailer from "nodemailer"



//method to send email
const sendEmail = async (options) => {




   const mailGenerator =  new Mailgen({
        theme:"default",
        product:{
            name:"Vikalpa Foundation Trust App",
            link:"https://erp.buniyaadhry.com"
        }
    })

    const emailTextual = mailGenerator.generatePlaintext(options.mailgenContent)

    const emailHtml = mailGenerator.generate(options.mailgenContent)

    // //Sending email
    // const transporter = nodemailer.createTransport({
    //     host: process.env.MAILTRAP_SMTP_HOST,
    //     port: process.env.MAILTRAP_SMTP_PORT,
    //     auth:{
    //         user: process.env.MAILTRAP_SMTP_USER,
    //         pass: process.env.MAILTRAP_SMTP_PASS
    //     }
    // })



    //Sending email
    const transporter = nodemailer.createTransport({
       service: "gmail",
        auth:{
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_APP_PASSWORD
        }
    })


    const mail= {
        //from: "mb.shbuhamshah@gmail.com",
         from: {
        name: "Vikalpa Foundation Trust",
        address: process.env.GMAIL_USER
    },
        to: options.email,
        subject: options.subject,
        text: emailTextual,
        html: emailHtml
    }

 

    try {
        const info =   await transporter.sendMail(mail)



    } catch (error) {
        console.error("Email service failed silently. Make sure that you have provided your MAILTRAP credentials in the .env file")
        console.error("Error: ", error)
    }
}


const emailVerificationMailgenContent = (userName, verificationUrl)=>{

    return({
        body: {
            name: userName,
            intro: "Welcom to our App! We are excited to have you on board.",
            action:{
                instructions: "To verify your email please click on the following button",
                button: {
                    color:"#22BC66",
                    text:"Verify your Email!",
                    link: verificationUrl
                }
            },
            outro: "Need help, or have questions? Just reply to this email, we'd love to help."
        }
    })
}



const forgotPasswordMailgenContent = (userName, passwordResetUrl)=>{

    return({
        body: {
            name: userName,
            intro: "We got the request to reset the password of your account.",
            action:{
                instructions: "To reset your password click on the following button or link",
                button: {
                    color:"#22BC66",
                    text:"Reset Password",
                    link: passwordResetUrl
                }
            },
            outro: "Need help, or have questions? Just reply to this email, we'd love to help."
        }
    })
}


export {
    emailVerificationMailgenContent,
    forgotPasswordMailgenContent,
    sendEmail
}