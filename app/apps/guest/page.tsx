import type {Metadata} from "next";
import {GuestWebApp} from "@/components/webapp/GuestWebApp";
import "@/components/webapp/webapp.css";
export const metadata:Metadata={title:"Guest web app",manifest:"/apps/guest/manifest.webmanifest"};
export default function GuestAppPage(){return <GuestWebApp/>}
