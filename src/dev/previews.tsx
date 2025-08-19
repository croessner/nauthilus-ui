import {ComponentPreview, Previews} from "@react-buddy/ide-toolbox";
import {PaletteTree} from "./palette";
import FrontendConfig from "../components/FrontendConfig";
import ServerConfig from "../components/ServerConfig";

const ComponentPreviews = () => {
    return (
        <Previews palette={<PaletteTree/>}>
            <ComponentPreview path="/FrontendConfig">
                <FrontendConfig/>
            </ComponentPreview>
            <ComponentPreview path="/ServerConfig">
                <ServerConfig/>
            </ComponentPreview>
        </Previews>
    );
};

export default ComponentPreviews;
