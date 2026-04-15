import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { HelloWorld } from "../../../target/types/hello_world";

describe("hello_world", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.HelloWorld as Program<HelloWorld>;

  it("calls initialize", async () => {
    const tx = await program.methods.initialize().rpc();
    console.log("tx:", tx);
  });
});